import Processor from 'engine/processor/processor';

import Rectangle from './geometry/shapes/rectangle';
import Color from './color/color';
import textureHandlers from './textureHandlers';
import ShaderBuilder from './shaderBuilder/shaderBuilder';
import MatrixTransformer from './matrixTransformer/matrixTransformer';

const MAX_COLOR_NUMBER = 255;
const DRAW_OFFSET = 0;
const DRAW_COUNT = 6;
const STD_SCREEN_SIZE = 1080;

const VECTOR_2_SIZE = 2;
const BYTES_PER_VECTOR_2 = Float32Array.BYTES_PER_ELEMENT * VECTOR_2_SIZE;
const MATRIX_ROW_SIZE = 3;
const MATRIX_COLUMN_SIZE = 3;
const MATRIX_SIZE = MATRIX_ROW_SIZE * MATRIX_COLUMN_SIZE;
const BYTES_PER_MATRIX = Float32Array.BYTES_PER_ELEMENT * MATRIX_SIZE;
const BYTES_PER_MATRIX_ROW = Float32Array.BYTES_PER_ELEMENT * MATRIX_ROW_SIZE;

const VERTEX_STRIDE = (VECTOR_2_SIZE * 5) + (MATRIX_SIZE);
const VERTEX_DATA_STRIDE = VERTEX_STRIDE * DRAW_COUNT;

const BUFFER_SIZE = 1000 * VERTEX_DATA_STRIDE * Float32Array.BYTES_PER_ELEMENT;

const RENDERABLE_COMPONENT_NAME = 'renderable';
const TRANSFORM_COMPONENT_NAME = 'transform';
const CAMERA_COMPONENT_NAME = 'camera';
const CURRENT_CAMERA_NAME = 'currentCamera';

class RenderProcessor extends Processor {
  constructor(options) {
    super();

    const {
      window, textureAtlas,
      textureAtlasDescriptor, backgroundColor,
      gameObjectObserver, sortingLayers,
      store, scaleSensitivity,
    } = options;

    this.textureAtlas = textureAtlas;
    this.textureAtlasSize = {
      width: this.textureAtlas.width,
      height: this.textureAtlas.height,
    };
    this.textureAtlasDescriptor = textureAtlasDescriptor;
    this.textureHandlers = Object.keys(textureHandlers).reduce((storage, key) => {
      const TextureHandler = textureHandlers[key];
      storage[key] = new TextureHandler();
      return storage;
    }, {});

    this._matrixTransformer = new MatrixTransformer();

    this._backgroundColor = new Color(backgroundColor);

    this._view = window;
    this._viewWidth;
    this._viewHeight;

    this._windowDidResize = true;
    this._onWindowResize = this._onWindowResize.bind(this);

    this._shaders = [];

    this._sortingLayer = sortingLayers.reduce((storage, layer, index) => {
      storage[layer] = index;
      return storage;
    }, {});
    this._store = store;
    this._gameObjectObserver = gameObjectObserver;

    this._scaleSensitivity = Math.min(Math.max(scaleSensitivity, 0), 100) / 100;
    this._screenScale = 1;

    this._vaoExt = null;

    this._buffer = null;
    this._vao = null;

    this._geometry = {};
    this._viewMatrixStats = {};

    this._vertexData = null;
    this._gameObjectsCount = 0;
  }

  processorDidMount() {
    window.addEventListener('resize', this._onWindowResize);
    this.gl = this._initGraphicContext();
    this._initExtensions();
    this._initScreen();
    this.program = this._initShaders();
    this._initProgramInfo();
    this.textures = this._initTextures();
  }

  processorWillUnmount() {
    window.removeEventListener('resize', this._onWindowResize);
    this._shaders.forEach((shader) => {
      this.gl.detachShader(this.program, shader);
      this.gl.deleteShader(shader);
    });
    this.gl.deleteProgram(this.program);
    this.gl.deleteTexture(this.textures);

    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this._buffer = null;
    this._shaders.length = 0;
    this.program = null;
    this.textures = null;
    this.gl = null;
    this._vao = null;
    this._vaoExt = null;
    this._geometry = {};
    this._viewMatrixStats = {};
    this._vertexData = null;
    this._gameObjectsCount = 0;
  }

  _onWindowResize() {
    this._windowDidResize = true;
  }

  _initGraphicContext() {
    let graphicContext = null;

    try {
      graphicContext =
        this._view.getContext('webgl') || this._view.getContext('experimental-webgl');
    } catch (e) {
      throw new Error('Unable to get graphic context.');
    }

    if (!graphicContext) {
      throw new Error('Unable to initialize WebGL. Your browser may not support it.');
    }

    return graphicContext;
  }

  _initExtensions() {
    this._vaoExt = this.gl.getExtension('OES_vertex_array_object');

    if (!this._vaoExt) {
      return alert('Unable to initialize OES_vertex_array_object extension');
    }
  }

  _initScreen() {
    this.gl.clearColor(
      this._backgroundColor.red() / MAX_COLOR_NUMBER,
      this._backgroundColor.green() / MAX_COLOR_NUMBER,
      this._backgroundColor.blue() / MAX_COLOR_NUMBER,
      1.0
    );
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  _initShaders() {
    const shaderBuilder = new ShaderBuilder(this.gl);

    const vertexShader = shaderBuilder.create(shaderBuilder.VERTEX_SHADER);
    const fragmentShader = shaderBuilder.create(shaderBuilder.FRAGMENT_SHADER);

    const shaderProgram = this.gl.createProgram();
    this.gl.attachShader(shaderProgram, vertexShader);
    this.gl.attachShader(shaderProgram, fragmentShader);

    this.gl.linkProgram(shaderProgram);

    if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
      throw new Error('Unable to initialize the shader program.');
    }

    this._shaders.push(vertexShader, fragmentShader);

    return shaderProgram;
  }

  _initProgramInfo() {
    this.gl.useProgram(this.program);

    this._variables = {
      aPosition: this.gl.getAttribLocation(this.program, 'a_position'),
      aTexCoord: this.gl.getAttribLocation(this.program, 'a_texCoord'),
      aModelViewMatrix: this.gl.getAttribLocation(this.program, 'a_modelViewMatrix'),
      aTexSize: this.gl.getAttribLocation(this.program, 'a_texSize'),
      aTexTranslate: this.gl.getAttribLocation(this.program, 'a_texTranslate'),
      aGameObjectSize: this.gl.getAttribLocation(this.program, 'a_gameObjectSize'),
      uViewMatrix: this.gl.getUniformLocation(this.program, 'u_viewMatrix'),
      uTexAtlasSize: this.gl.getUniformLocation(this.program, 'u_texAtlasSize'),
    };

    this._buffer = this.gl.createBuffer();
    this._vao = this._createVAO();

    this._setUpGlobalUniforms();
  }

  _createVAO() {
    const vao = this._vaoExt.createVertexArrayOES();
    this._vaoExt.bindVertexArrayOES(vao);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, BUFFER_SIZE, this.gl.DYNAMIC_DRAW);

    const attrs = [
      {
        loc: this._variables.aPosition,
        type: 'vec2',
      },
      {
        loc: this._variables.aTexCoord,
        type: 'vec2',
      },
      {
        loc: this._variables.aModelViewMatrix,
        type: 'mat3',
      },
      {
        loc: this._variables.aTexSize,
        type: 'vec2',
      },
      {
        loc: this._variables.aTexTranslate,
        type: 'vec2',
      },
      {
        loc: this._variables.aGameObjectSize,
        type: 'vec2',
      },
    ];
    const sizeMap = {
      mat3: BYTES_PER_MATRIX,
      vec2: BYTES_PER_VECTOR_2,
    };
    const stride = attrs.reduce((totalSize, attr) => (
      totalSize + sizeMap[attr.type]
    ), 0);

    let offset = 0;
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].type === 'vec2') {
        this.gl.enableVertexAttribArray(attrs[i].loc);
        this.gl.vertexAttribPointer(
          attrs[i].loc,
          VECTOR_2_SIZE,
          this.gl.FLOAT,
          false,
          stride,
          offset
        );

        offset += BYTES_PER_VECTOR_2;
      } else if (attrs[i].type === 'mat3') {
        for (let j = 0; j < MATRIX_ROW_SIZE; j++) {
          const loc = attrs[i].loc + j;

          this.gl.enableVertexAttribArray(loc);
          this.gl.vertexAttribPointer(
            loc,
            MATRIX_ROW_SIZE,
            this.gl.FLOAT,
            false,
            stride,
            offset + (j * BYTES_PER_MATRIX_ROW)
          );
        }

        offset += BYTES_PER_MATRIX;
      }
    }

    this._vaoExt.bindVertexArrayOES(null);

    return vao;
  }

  _setUpGlobalUniforms() {
    this.gl.uniform2fv(
      this._variables.uTexAtlasSize,
      [ this.textureAtlasSize.width, this.textureAtlasSize.height ]
    );
  }

  _initTextures() {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textureAtlas
    );

    return texture;
  }

  _getModelViewMatrix(renderable, x, y, rotation, scaleX, scaleY) {
    const matrixTransformer = this._matrixTransformer;

    const matrix = matrixTransformer.getIdentityMatrix();

    matrixTransformer.translate(matrix, renderable.origin[0], renderable.origin[1]);
    matrixTransformer.scale(matrix, scaleX, scaleY);
    renderable.flipX && matrixTransformer.flipX(matrix);
    renderable.flipY && matrixTransformer.flipY(matrix);
    matrixTransformer.rotate(matrix, (renderable.rotation + rotation) % 360);
    matrixTransformer.translate(matrix, x, y);

    return matrix;
  }

  _getCompareFunction() {
    return (a, b) => {
      const aRenderable = a.getComponent(RENDERABLE_COMPONENT_NAME);
      const bRenderable = b.getComponent(RENDERABLE_COMPONENT_NAME);
      const aSortingLayerOrder = this._sortingLayer[aRenderable.sortingLayer];
      const bSortingLayerOrder = this._sortingLayer[bRenderable.sortingLayer];

      if (aSortingLayerOrder > bSortingLayerOrder) {
        return 1;
      }

      if (aSortingLayerOrder < bSortingLayerOrder) {
        return -1;
      }

      const aTransform = a.getComponent(TRANSFORM_COMPONENT_NAME);
      const bTransform = b.getComponent(TRANSFORM_COMPONENT_NAME);

      const aOffsetY = aTransform.offsetY + (aTransform.scaleY * aRenderable.height / 2);
      const bOffsetY = bTransform.offsetY + (bTransform.scaleY * bRenderable.height / 2);

      if (aOffsetY > bOffsetY) {
        return 1;
      }

      if (aOffsetY < bOffsetY) {
        return -1;
      }

      const aOffsetX = aTransform.offsetX + (aTransform.scaleX * aRenderable.width / 2);
      const bOffsetX = bTransform.offsetX + (bTransform.scaleX * bRenderable.width / 2);

      if (aOffsetX > bOffsetX) {
        return 1;
      }

      if (aOffsetX < bOffsetX) {
        return -1;
      }

      return 0;
    };
  }

  _setUpTextureInfo(textureInfo, renderable, offset) {
    this._vertexData[offset] = textureInfo.width;
    this._vertexData[offset + 1] = textureInfo.height;
    this._vertexData[offset + 2] = textureInfo.x;
    this._vertexData[offset + 3] = textureInfo.y;
    this._vertexData[offset + 4] = renderable.width;
    this._vertexData[offset + 5] = renderable.height;
  }

  _setUpMatrix(matrix, offset) {
    this._vertexData[offset] = matrix[0];
    this._vertexData[offset + 1] = matrix[1];
    this._vertexData[offset + 2] = matrix[2];
    this._vertexData[offset + 3] = matrix[3];
    this._vertexData[offset + 4] = matrix[4];
    this._vertexData[offset + 5] = matrix[5];
    this._vertexData[offset + 6] = matrix[6];
    this._vertexData[offset + 7] = matrix[7];
    this._vertexData[offset + 8] = matrix[8];
  }

  _setUpVertexData(gameObject, index) {
    const gameObjectId = gameObject.getId();
    const renderable = gameObject.getComponent(RENDERABLE_COMPONENT_NAME);
    const offset = index * VERTEX_DATA_STRIDE;

    if (renderable.disabled) {
      for (let i = 0; i < VERTEX_DATA_STRIDE; i++) {
        this._vertexData[offset + i] = 0;
      }
      return;
    }

    const transform = gameObject.getComponent(TRANSFORM_COMPONENT_NAME);
    const texture = this.textureAtlasDescriptor[renderable.src];
    const textureInfo = this.textureHandlers[renderable.type].handle(texture, renderable);

    const modelViewMatrix = this._getModelViewMatrix(
      renderable,
      transform.offsetX,
      transform.offsetY,
      transform.rotation,
      transform.scaleX,
      transform.scaleY
    );

    if (!this._geometry[gameObjectId]) {
      this._geometry[gameObjectId] = {
        position: new Rectangle(renderable.width, renderable.height).toArray(),
        texCoord: new Rectangle(textureInfo.width, textureInfo.height).toArray(),
      };
    }

    const position = this._geometry[gameObjectId].position;
    const texCoord = this._geometry[gameObjectId].texCoord;

    for (let i = 0, j = offset; i < position.length; i += 2, j += VERTEX_STRIDE) {
      this._vertexData[j] = position[i];
      this._vertexData[j + 1] = position[i + 1];
      this._vertexData[j + 2] = texCoord[i];
      this._vertexData[j + 3] = texCoord[i + 1];

      this._setUpMatrix(modelViewMatrix, j + (VECTOR_2_SIZE * 2));
      this._setUpTextureInfo(textureInfo, renderable, j + (VECTOR_2_SIZE * 2) + MATRIX_SIZE);
    }
  }

  _resizeCanvas(canvas) {
    if (!this._windowDidResize) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    this._viewWidth = this._view.clientWidth;
    this._viewHeight = this._view.clientHeight;

    const canvasWidth = this._viewWidth * devicePixelRatio;
    const canvasHeight = this._viewHeight * devicePixelRatio;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const screenSize = Math.sqrt(
      Math.pow(canvas.clientWidth, 2) + Math.pow(canvas.clientHeight, 2)
    );
    const avaragingValue = 1 - this._scaleSensitivity;
    const normalizedSize = screenSize - ((screenSize - STD_SCREEN_SIZE) * avaragingValue);

    this._screenScale = normalizedSize / STD_SCREEN_SIZE;

    this.gl.viewport(0, 0, canvasWidth, canvasHeight);

    this._windowDidResize = false;
  }

  _updateViewMatrix() {
    const currentCamera = this._store.get(CURRENT_CAMERA_NAME);
    const transform = currentCamera.getComponent(TRANSFORM_COMPONENT_NAME);
    const { zoom } = currentCamera.getComponent(CAMERA_COMPONENT_NAME);
    const scale =  zoom * this._screenScale;

    const prevStats = this._viewMatrixStats;

    if (
      prevStats.x === transform.offsetX &&
      prevStats.y === transform.offsetY &&
      prevStats.width === this._viewWidth &&
      prevStats.height === this._viewHeight &&
      prevStats.scale === scale
    ) {
      return;
    }

    const matrixTransformer = this._matrixTransformer;
    const viewMatrix = matrixTransformer.getIdentityMatrix();
    matrixTransformer.translate(viewMatrix, -transform.offsetX, -transform.offsetY);
    matrixTransformer.scale(viewMatrix, scale, scale);
    matrixTransformer.project(viewMatrix, this._viewWidth, this._viewHeight);

    this.gl.uniformMatrix3fv(
      this._variables.uViewMatrix,
      false,
      viewMatrix
    );

    this._viewMatrixStats.width = this._viewWidth;
    this._viewMatrixStats.height = this._viewHeight;
    this._viewMatrixStats.x = transform.offsetX;
    this._viewMatrixStats.y = transform.offsetY;
    this._viewMatrixStats.scale = scale;
  }

  _allocateVertexData() {
    const gameObjectsCount = this._gameObjectObserver.size();
    if (this._gameObjectsCount !== gameObjectsCount) {
      this._gameObjectsCount = gameObjectsCount;
      this._vertexData = new Float32Array(this._gameObjectsCount * VERTEX_DATA_STRIDE);
    }
  }

  _setUpBuffers() {
    this._vaoExt.bindVertexArrayOES(this._vao);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this._vertexData);
  }

  _processRemovedGameObjects() {
    this._gameObjectObserver.getLastRemoved().forEach((gameObject) => {
      const gameObjectId = gameObject.getId();
      this._geometry[gameObjectId] = null;
    });
  }

  process() {
    const canvas = this.gl.canvas;

    this._resizeCanvas(canvas);

    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this._processRemovedGameObjects();

    this._updateViewMatrix();
    this._allocateVertexData();
    this._gameObjectObserver.sort(this._getCompareFunction());

    this._gameObjectObserver.forEach((gameObject, index) => {
      this._setUpVertexData(gameObject, index);
    });

    this._setUpBuffers();
    this.gl.drawArrays(
      this.gl.TRIANGLES, DRAW_OFFSET, DRAW_COUNT * this._gameObjectObserver.size()
    );
  }
}

export default RenderProcessor;
