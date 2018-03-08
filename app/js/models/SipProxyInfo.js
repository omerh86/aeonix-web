function SipProxyInfo (serverAddress, proxyAddress, transport, proxyConfigReference) {
    this.serverAddress = serverAddress;
    this.proxyAddress = proxyAddress;
    this.transport = transport;
    this.proxyConfigReference = proxyConfigReference;
    this.registerRequestIssuedAt = null;
    this.registerResponseArrivedAt = null;
}

SipProxyInfo.prototype.getResponseTime = function() {
    if (this.registerResponseArrivedAt==null) return null;
    else return this.registerResponseArrivedAt-this.registerRequestIssuedAt;
}





