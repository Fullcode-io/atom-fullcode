var DemoPackageView;

var DemoPackageView = (function() {
  function DemoPackageView(serializedState) {
    var message;
    this.element = document.createElement('div');
    this.element.classList.add('demo-package');
    message = document.createElement('div');
    message.textContent = "The DemoPackage package is Alive! It's ALIVE!";
    message.classList.add('message');
    this.element.appendChild(message);
  }

  DemoPackageView.prototype.serialize = function() {};

  DemoPackageView.prototype.destroy = function() {
    return this.element.remove();
  };

  DemoPackageView.prototype.getElement = function() {
    return this.element; 
  };

  return DemoPackageView;

})();

module.exports = DemoPackageView;
