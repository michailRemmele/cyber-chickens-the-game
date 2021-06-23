import Processor from 'engine/processor/processor';

import Observer from './observer/observer';
import MapObserver from './observer/mapObserver';

class UiBridge extends Processor {
  constructor(options) {
    super();

    const {
      onInit,
      onDestroy,
      sceneController,
      gameObjectObserver,
      gameObjectSpawner,
      gameObjectDestroyer,
      store,
    } = options;

    this._onUiInit = onInit;
    this._onUiDestroy = onDestroy;
    this._sceneController = sceneController;
    this._gameObjectObserver = gameObjectObserver;
    this._gameObjectSpawner = gameObjectSpawner;
    this._gameObjectDestroyer = gameObjectDestroyer;
    this._store = store;

    this._messageBusObserver = new Observer();
    this._storeObserver = new Observer();
    this._gameObjects = new MapObserver();

    this._messageQueue = [];
    this._actionsQueue = [];
  }

  processorDidMount() {
    this._onUiInit({
      sceneName: this._sceneController.getCurrentName(),
      messageBusObserver: this._messageBusObserver,
      storeObserver: this._storeObserver,
      pushMessage: this._pushMessage.bind(this),
      pushAction: this._pushAction.bind(this),
      gameObjects: this._gameObjects,
    });
  }

  processorWillUnmount() {
    this._onUiDestroy();
  }

  _pushAction(action) {
    this._actionsQueue.push(action);
  }

  _pushMessage(message) {
    this._messageQueue.push(message);
  }

  _processRemovedGameObjects() {
    this._gameObjectObserver.getLastRemoved().forEach((gameObject) => {
      this._gameObjects.next(null, gameObject.getId());
    });
  }

  process(options) {
    const { messageBus, deltaTime } = options;

    this._processRemovedGameObjects();

    this._gameObjectObserver.forEach((gameObject) => {
      this._gameObjects.next(gameObject, gameObject.getId());
    });

    this._messageBusObserver.next(messageBus);
    this._storeObserver.next(this._store);

    this._messageQueue.forEach((message) => {
      messageBus.send(message, true);
    });

    this._messageQueue.length = 0;

    this._actionsQueue.forEach((action) => {
      action({
        messageBus,
        deltaTime,
        store: this._store,
        gameObjectSpawner: this._gameObjectSpawner,
        gameObjectDestroyer: this._gameObjectDestroyer,
      });
    });

    this._actionsQueue.length = 0;
  }
}

export default UiBridge;
