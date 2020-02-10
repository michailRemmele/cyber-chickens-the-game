import Vector2 from 'utils/vector/vector2';

import Processor from 'engine/processor/processor';

const ADD_FORCE_MSG = 'ADD_FORCE';

const RIGID_BODY_COMPONENT_NAME = 'rigidBody';
const TRANSFORM_COMPONENT_NAME = 'transform';

const GRAVITY_FORCE = 'gravityForce';
const REACTION_FORCE = 'reactionForce';

const FRICTION_FORCE_COEFFICIENT = 0.5;

const DIRECTION_VECTOR = {
  UP: new Vector2(0, -1),
  LEFT: new Vector2(-1, 0),
  RIGHT: new Vector2(1, 0),
  DOWN: new Vector2(0, 1),
};

class PhysicsProcessor extends Processor {
  constructor(options) {
    super();

    const { gravitationalAcceleration } = options;

    this._gravitationalAcceleration = gravitationalAcceleration;

    this._gameObjectObserver = options.gameObjectObserver;

    this._gameObjectsVelocity = {};
    this._temproraryForcesMap = {};
  }

  _processAddedGameObjects() {
    this._gameObjectObserver.getLastAdded().forEach((gameObject) => {
      this._addGravityForce(gameObject.getComponent(RIGID_BODY_COMPONENT_NAME));
    });
  }

  _processRemovedGameObjects() {
    this._gameObjectObserver.getLastRemoved().forEach((gameObject) => {
      const gameObjectId = gameObject.getId();
      this._gameObjectsVelocity[gameObjectId] = null;
    });
  }

  _processIncomingForces(addForceMessages, gameObjectId, forceVectors) {
    addForceMessages.forEach((message) => {
      const { name, value, duration } = message;
      this._temproraryForcesMap[gameObjectId] = this._temproraryForcesMap[gameObjectId] || {};

      if (duration) {
        this._temproraryForcesMap[gameObjectId][name] = duration;
      } else if (this._temproraryForcesMap[gameObjectId][name]) {
        this._temproraryForcesMap[gameObjectId][name] = null;
      }

      forceVectors[name] = value;
    });
  }

  _filterTemporaryForces(forceVectors, temporaryForces, deltaTime) {
    Object.keys(forceVectors).forEach((forceName) => {
      const forceDuration = temporaryForces[forceName];

      if (forceDuration === null || forceDuration === undefined) {
        return;
      }

      if (forceDuration <= 0) {
        forceVectors[forceName] = null;
        temporaryForces[forceName] = null;
        return;
      }

      if (forceDuration < deltaTime) {
        forceVectors[forceName].multiplyNumber(forceDuration / deltaTime);
      }

      temporaryForces[forceName] -= deltaTime;
    });
  }

  _addGravityForce(rigidBody) {
    const { forceVectors, mass, useGravity } = rigidBody;

    if (useGravity && !forceVectors[GRAVITY_FORCE]) {
      forceVectors[GRAVITY_FORCE] = new Vector2(0, 0);
      forceVectors[GRAVITY_FORCE].add(DIRECTION_VECTOR.DOWN);
      forceVectors[GRAVITY_FORCE].multiplyNumber(mass * this._gravitationalAcceleration);
    }
  }

  _addFrictionForce(gameObject, deltaTime) {
    const { forceVectors, mass } = gameObject.getComponent(RIGID_BODY_COMPONENT_NAME);
    const gameObjectId = gameObject.getId();
    const velocity = this._gameObjectsVelocity[gameObjectId];

    if (!forceVectors[REACTION_FORCE] || !velocity || (!velocity.x && !velocity.y)) {
      return;
    }

    const velocitySignX = Math.sign(velocity.x);
    const velocitySignY = Math.sign(velocity.y);

    const reactionForceValue = forceVectors[REACTION_FORCE].magnitude;
    const frictionForceValue = -1 * FRICTION_FORCE_COEFFICIENT * reactionForceValue;
    const forceToVelocityMultiplier = deltaTime / mass;
    const slowdownValue = frictionForceValue * forceToVelocityMultiplier;
    const normalizationMultiplier = 1 / velocity.magnitude;

    const slowdown = velocity.clone();
    slowdown.multiplyNumber(slowdownValue * normalizationMultiplier);

    velocity.add(slowdown);

    if (Math.sign(velocity.x) !== velocitySignX && Math.sign(velocity.y) !== velocitySignY) {
      velocity.multiplyNumber(0);
    }
  }

  process(options) {
    const deltaTimeInMsec = options.deltaTime;
    const deltaTimeInSeconds = deltaTimeInMsec / 1000;
    const messageBus = options.messageBus;

    this._processAddedGameObjects();
    this._processRemovedGameObjects();

    this._gameObjectObserver.forEach((gameObject) => {
      const gameObjectId = gameObject.getId();
      const rigidBody = gameObject.getComponent(RIGID_BODY_COMPONENT_NAME);
      const transform = gameObject.getComponent(TRANSFORM_COMPONENT_NAME);
      const { forceVectors, mass } = rigidBody;

      const addForceMessages = messageBus.getById(ADD_FORCE_MSG, gameObjectId) || [];

      this._processIncomingForces(addForceMessages, gameObjectId, forceVectors);

      const temporaryForces = this._temproraryForcesMap[gameObjectId] || {};

      this._filterTemporaryForces(forceVectors, temporaryForces, deltaTimeInMsec);

      const forceVector = Object.keys(forceVectors).reduce((resultantForceVector, forceName) => {
        if (!forceVectors[forceName]) {
          return resultantForceVector;
        }

        resultantForceVector.add(forceVectors[forceName]);

        return resultantForceVector;
      }, new Vector2(0, 0));

      this._gameObjectsVelocity[gameObjectId] = this._gameObjectsVelocity[gameObjectId]
        || new Vector2(0, 0);

      const velocityVector = this._gameObjectsVelocity[gameObjectId];

      if (forceVector.x || forceVector.y) {
        const velocityIncrease = forceVector.clone();
        velocityIncrease.multiplyNumber(deltaTimeInSeconds / mass);
        velocityVector.add(velocityIncrease);
      }

      this._addFrictionForce(gameObject, deltaTimeInSeconds);

      transform.offsetX = transform.offsetX + (velocityVector.x * deltaTimeInSeconds);
      transform.offsetY = transform.offsetY + (velocityVector.y * deltaTimeInSeconds);
    });
  }
}

export default PhysicsProcessor;
