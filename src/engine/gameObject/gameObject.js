const COMPONENT_ADDED = 'COMPONENT_ADDED';
const COMPONENT_REMOVED = 'COMPONENT_REMOVED';

const findAncestor = (gameObject) => {
  const parent = gameObject.getParent();

  if (parent) {
    return findAncestor(parent);
  }

  return gameObject;
};

class GameObject {
  constructor(id) {
    this._id = id;
    this._components = {};
    this._parent = null;
    this._children = [];
    this._type = null;

    this._subscribers = [];

    this.COMPONENT_ADDED = COMPONENT_ADDED;
    this.COMPONENT_REMOVED = COMPONENT_REMOVED;
  }

  setParent(parent) {
    this._parent = parent;
  }

  getParent() {
    return this._parent;
  }

  getAncestor() {
    return findAncestor(this);
  }

  appendChild(child) {
    this._children.push(child);
  }

  getChildren() {
    return this._children;
  }

  getId() {
    return this._id;
  }

  getComponentNamesList() {
    return Object.keys(this._components);
  }

  getComponent(name) {
    return this._components[name];
  }

  setComponent(name, component) {
    this._components[name] = component;

    if (this._parent && this._parent.getComponent(name)) {
      component.parent = this._parent.getComponent(name);
    }

    this._children.forEach((child) => {
      if (child.getComponent(name)) {
        child.getComponent(name).parent = component;
      }
    });

    this._subscribers.forEach((callback) => {
      callback({
        type: COMPONENT_ADDED,
        componentName: name,
        gameObject: this,
      });
    });
  }

  removeComponent(name) {
    this._components[name] = undefined;

    this._children.forEach((child) => {
      if (child.getComponent(name)) {
        child.getComponent(name).parent = undefined;
      }
    });

    this._subscribers.forEach((callback) => {
      callback({
        type: COMPONENT_REMOVED,
        componentName: name,
        gameObject: this,
      });
    });
  }

  getType() {
    return this._type;
  }

  setType(type) {
    this._type = type;
  }

  subscribe(callback) {
    if (!(callback instanceof Function)) {
      throw new Error('On subscribe callback should be a function');
    }

    this._subscribers.push(callback);
  }

  clearSubscriptions() {
    this._subscribers.length = 0;
  }
}

export default GameObject;
