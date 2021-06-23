class MessageBus {
  constructor() {
    this._messages = {};
    this._stashedMessages = [];
    this._delayedMessages = [];
  }

  send(message, delay = false) {
    if (!message.type) {
      throw new Error('Can\'t send the message without specified type');
    }

    if (delay) {
      this._delayedMessages.push(message);
      return;
    }

    const { type, id } = message;

    this._messages[type] = this._messages[type] || { array: [], map: {}};

    if (id) {
      this._messages[type].map[id] = this._messages[type].map[id] || [];
      this._messages[type].map[id].push(message);
    }

    this._messages[type].array.push(message);
  }

  get(messageType) {
    return this._messages[messageType] ? this._messages[messageType].array : undefined;
  }

  getById(messageType, id) {
    return this._messages[messageType] ? this._messages[messageType].map[id] : undefined;
  }

  delete(messageType) {
    this._messages[messageType] = undefined;
  }

  deleteById(messageType, id) {
    const messagesToDelete = this.getById(messageType, id);

    if (!messagesToDelete) {
      return;
    }

    this._messages[messageType].array = this._messages[messageType].array.filter((message) => {
      return !messagesToDelete.includes(message);
    });
    this._messages[messageType].map[id] = undefined;
  }

  stash() {
    this._stashedMessages.push(this._messages);
    this._messages = {};
  }

  restore() {
    if (this._stashedMessages.length === 0) {
      return;
    }

    this._stashedMessages.push(this._messages);
    this._messages = this._stashedMessages.reduce((storage, messages) => {
      Object.keys(messages).forEach((key) => {
        if (!messages[key]) {
          return;
        }

        storage[key] = storage[key] || { array: [], map: {}};
        storage[key].array = storage[key].array.concat(messages[key].array);
        storage[key].map = Object.keys(messages[key].map).reduce((map, messageId) => {
          if (!map[messageId]) {
            map[messageId] = messages[key].map[messageId];
          } else {
            map[messageId] = map[messageId].concat(messages[key].map[messageId]);
          }

          return map;
        }, storage[key].map);
      });
      return storage;
    }, {});
    this._stashedMessages.length = 0;
  }

  sendDelayed() {
    if (!this._delayedMessages.length) {
      return;
    }

    this._delayedMessages.forEach((message) => {
      this.send(message);
    });
    this._delayedMessages.length = 0;
  }

  clear() {
    this._messages = {};
  }

  reset() {
    this._messages = {};
    this._stashedMessages.length = 0;
    this._delayedMessages.length = 0;
  }
}

export default MessageBus;
