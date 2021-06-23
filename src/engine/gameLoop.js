import IOC from './ioc/ioc';
import MessageBus from './messageBus/messageBus';

import { SCENE_PROVIDER_KEY_NAME, SECTIONS } from 'engine/consts/global';
const MS_PER_UPDATE = 1000 / 50;

class GameLoop {
  constructor() {
    this.gameLoopId = null;

    this.sceneProvider = IOC.resolve(SCENE_PROVIDER_KEY_NAME);
    this.messageBus = new MessageBus();

    this.bindedTick = this.tick.bind(this);
  }

  _processSection(sectionName, options) {
    const currentScene = this.sceneProvider.getCurrentScene();
    const section = currentScene.getProcessorSection(sectionName);

    options = {
      ...(options ? options : {}),
      messageBus: this.messageBus,
    };

    section.forEach((processor) => {
      processor.process(options);
    });
  }

  _gameStateUpdate() {
    if (this.lag < MS_PER_UPDATE) {
      this.messageBus.stash();
      return;
    }

    while (this.lag >= MS_PER_UPDATE) {
      this._processSection(SECTIONS.GAME_STATE_UPDATE_SECTION_NAME, { deltaTime: MS_PER_UPDATE });
      this.lag -= MS_PER_UPDATE;

      if (this.lag >= MS_PER_UPDATE) {
        this.messageBus.stash();
        this.messageBus.sendDelayed();
      }
    }

    this.messageBus.restore();
  }

  tick() {
    const current = performance.now();

    const elapsed = current - this.previous;
    this.lag += elapsed;

    this.messageBus.restore();
    this.messageBus.sendDelayed();

    this._processSection(SECTIONS.EVENT_PROCESS_SECTION_NAME);
    this._gameStateUpdate();
    this._processSection(SECTIONS.RENDERING_SECTION_NAME, { deltaTime: elapsed });

    this.messageBus.clear();

    this.previous = current;

    this.gameLoopId = requestAnimationFrame(this.bindedTick);
  }

  run() {
    this.previous = performance.now();
    this.lag = 0;

    this.gameLoopId = requestAnimationFrame(this.bindedTick);
  }

  stop() {
    if (this.gameLoopId) {
      cancelAnimationFrame(this.gameLoopId);
    }
  }
}

export default GameLoop;
