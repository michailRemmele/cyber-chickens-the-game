import IOC from './ioc/ioc';
import MessageBus from './messageBus/messageBus';

import { SCENE_PROVIDER_KEY_NAME, SECTIONS } from 'engine/consts/global';
const MS_PER_UPDATE = 1000 / 60;

class GameLoop {
  constructor() {
    this.gameLoopId = null;

    this.sceneProvider = IOC.resolve(SCENE_PROVIDER_KEY_NAME);
    this.messageBus = new MessageBus();
  }

  _processSection(section, options) {
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

    const currentScene = this.sceneProvider.getCurrentScene();
    const gameStateUpdateSection = currentScene.getProcessorSection(
      SECTIONS.GAME_STATE_UPDATE_SECTION_NAME
    );

    while (this.lag >= MS_PER_UPDATE) {
      this._processSection(gameStateUpdateSection, { deltaTime: MS_PER_UPDATE });
      this.lag -= MS_PER_UPDATE;

      if (this.lag >= MS_PER_UPDATE) {
        this.messageBus.stash();
      }
    }

    this.messageBus.restore();
  }

  run() {
    this.previous = undefined;
    this.lag = 0;

    const that = this;
    this.gameLoopId = requestAnimationFrame(function tick(current) {
      that.previous = that.previous || current;

      const currentScene = that.sceneProvider.getCurrentScene();
      const eventProcessSection = currentScene.getProcessorSection(
        SECTIONS.EVENT_PROCESS_SECTION_NAME
      );
      const renderingSection = currentScene.getProcessorSection(
        SECTIONS.RENDERING_SECTION_NAME
      );

      const elapsed = current - that.previous;
      that.previous = current;
      that.lag += elapsed;

      that.messageBus.restore();

      that._processSection(eventProcessSection);
      that._gameStateUpdate();
      that._processSection(renderingSection, { deltaTime: elapsed });

      that.messageBus.clear();
      that.gameLoopId = requestAnimationFrame(tick);
    });
  }

  stop() {
    if (this.gameLoopId) {
      cancelAnimationFrame(this.gameLoopId);
    }
  }
}

export default GameLoop;
