const vertexShader = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

attribute mat3 a_modelViewMatrix;
attribute mat3 a_texMatrix;

uniform mat3 u_viewMatrix;

varying vec2 v_texCoord;
varying mat3 v_texMatrix;

void main() {
  mat3 u_Matrix = u_viewMatrix * a_modelViewMatrix;
  gl_Position = vec4((u_Matrix * vec3(a_position, 1)).xy, 0, 1);

  v_texCoord = a_texCoord;
  v_texMatrix = a_texMatrix;
}
`;

export default vertexShader;
