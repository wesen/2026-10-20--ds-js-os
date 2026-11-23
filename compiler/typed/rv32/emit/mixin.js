// FunctionCode is one class written in several files: each file holds a group of its methods as a class of its
// own, and mixin() copies their methods onto FunctionCode's prototype, as class methods (not enumerable). The
// prototype chain stays one level deep, so a method call costs what it did when the methods shared one class
// body. A group's methods use no `super`; a name defined twice is an error.
export function mixin(target, ...groups) {
    for (const group of groups) {
        for (const name of Object.getOwnPropertyNames(group.prototype)) {
            if (name === "constructor") continue;
            if (Object.hasOwn(target.prototype, name)) throw new Error(target.name + "." + name + " is defined twice");
            Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(group.prototype, name));
        }
    }
}
