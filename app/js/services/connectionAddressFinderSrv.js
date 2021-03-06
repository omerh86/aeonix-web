
function ConnectionAddressFinderSrv($rootScope, $timeout) {

    var serviceLogger = logSrv.getLogger("connectionAddressFinderSrv");

    var eState =
    {
        idle: 0,
        searching: 1,
        disconnecting: 2
    };

    var endpointId = null;
    var connections = [];
    var timeout = null;
    var foundConnection = null;
    var preferredServer = null;
    var numOfResponses = 0;
    var disconnectFoundConnection;
    var onRegistrationStateChangedPromise= null;
    var state = eState.idle;



    function getMembers() {
        var o = {
            "state":state,
            "endpointId":endpointId,
            "connections":connections,
            "preferredServer": preferredServer,
            "timeout":timeout,
            "foundConnection":foundConnection,
            "numOfResponses":numOfResponses,
            "disconnectFoundConnection": disconnectFoundConnection
        };
        return o;
    }

    function findConnectionInfo(proxyConfigReference) {
        var connectionInfo = null;
        for (var i=0;i<connections.length;i++) {
            var ci = connections[i];
            if (ci.proxyConfigReference ==proxyConfigReference) {
                connectionInfo = ci;
                break;
            }
        }
        return connectionInfo;
    }

    function activeConnectionExists() {
        for (var i=0;i<connections.length;i++) {
            var connectionInfo = connections[i];
            if (connectionInfo.state=='RegistrationOk') {
                if (connectionInfo!=foundConnection || disconnectFoundConnection) {
                return true;
            }           
        }
        }
        return false;
    }

    function resetTimer(f, delay)  {
        if (timeout) {
            $timeout.cancel(timeout);
        }
        timeout = $timeout(f, delay, false);
    }

    function register(serverAddress, proxyAddress) {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        var identity = "sip:" + endpointId + "@" + serverAddress+";transport=udp";
        var proxy;
        if (proxyAddress) {
            proxy = proxyAddress;
        } else {
            proxy = serverAddress;
        }
        proxy = proxy + ";transport=udp";
        var route;
        if (proxyAddress) {
            route = "sip:" + proxyAddress+";transport=udp";
        }
        else {
            route = null;
        }

        var proxyConfigReference = JSBridge.createProxyConfig(identity, proxy, route, 60);

        var connectionInfo = new SipProxyInfo (serverAddress, proxyAddress, "udp", proxyConfigReference);
        connections.push(connectionInfo);

        JSBridge.addProxyConfig(proxyConfigReference);
        JSBridge.register(proxyConfigReference);

        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }


    function onDisconnectTimeout() {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        timeout = null;
        onDisconnectCompleted();

        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }
    
    function onSearchTimeout() {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        timeout = null;
        onSearchCompleted();

        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }

    function onDisconnectCompleted() {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        onRegistrationStateChangedPromise();
        onRegistrationStateChangedPromise = null;
        for (var i=0;i<connections.length;i++) {
            var connectionInfo = connections[i];
            if (connectionInfo!=foundConnection || disconnectFoundConnection) {
            JSBridge.removeProxyConfig(connectionInfo.proxyConfigReference);
                connectionInfo.proxyConfigReference = null;
            }
        }

        if (disconnectFoundConnection || !foundConnection) {
            //JSBridge.resetTransports();
        }

        endpointId = null;
        connections = [];
        if (timeout) {
            $timeout.cancel(timeout);
            timeout = null;
        }

        numOfResponses = 0;
        preferredServer = null;

        state = eState.idle;

        if (foundConnection) {
            var connection = foundConnection;
            foundConnection = null;
            logger.fine ("Found connection: server address - ", connection.serverAddress, ", proxy address - ", connection.proxyAddress);
            $rootScope.$broadcast("connectionAddressFinderSrv:connectionFound",connection);
        }else {
            logger.fine ("No available connection found");
            $rootScope.$broadcast("connectionAddressFinderSrv:connectionNotFound");
        }

        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }
    
    
    function onSearchCompleted(){
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        state = eState.disconnecting;

        if (timeout) {
            $timeout.cancel(timeout);
            timeout = null;
        }

        var terminating = false;
        for (var i=0;i<connections.length;i++) {
            var connectionInfo = connections[i];
            if (connectionInfo.state=='RegistrationOk') {
                var terminate = connectionInfo!=foundConnection || disconnectFoundConnection;
                if (terminate) {
                    terminating = true;
                    JSBridge.terminateRegistration(connectionInfo.proxyConfigReference);
                }
            }
        }


        if (terminating) {
            resetTimer(onDisconnectTimeout, 2000);
        }else {
            onDisconnectCompleted();
        }


        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }

   
    

    

    function findAvailableConnection(userName, serverAddresses, proxyAddresses, preferredServer, disconnectConnection ) {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        try {

            if (state ==eState.idle) {
                state =eState.searching;
                //JSBridge.resetTransports();
                onRegistrationStateChangedPromise = $rootScope.$on("linphone:RegistrationStateChanged", onRegistrationStateChanged);
                endpointId = "AITCreateCnxn_" + userName;
                preferredServer = preferredServer;
                disconnectFoundConnection = disconnectConnection;


                if (preferredServer) {
                    register(preferredServer, null);
                    for (var i=0;i<proxyAddresses.length;i++) {
                        register(preferredServer, proxyAddresses[i]);
                    }
                }

                for (var i=0;i<serverAddresses.length;i++) {
                    var serverAddress = serverAddresses[i];
                    if (serverAddress!=preferredServer && serverAddress) {
                        register(serverAddress, null);
                        for (var j=0;j<proxyAddresses.length;j++) {
                            if (proxyAddresses[j]) {
                                register(serverAddress, proxyAddresses[j]);
                            }

                        }
                    }
                }
                resetTimer(onSearchTimeout, 10000);
            }
        }catch(err){
            logger.error(err);
        }

        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }

    function firstConnectionHasBetterResponseTime(connectionInfo1, connectionInfo2, level) {
        return connectionInfo2.getResponseTime()-connectionInfo1.getResponseTime()>level;
    }

    function firstConnectionHasBetterNetworkRoute(connectionInfo1, connectionInfo2) {
        return (!connectionInfo1.proxyAddress && connectionInfo1.proxyAddress);
    }



    function chooseBetterConnection(connectionInfo1, connectionInfo2) {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);
        var betterConnection;
        if (firstConnectionHasBetterResponseTime(connectionInfo1,connectionInfo2, 50)) {
            betterConnection = connectionInfo1;
            logger.finest("first connection has been chosen due to much better connection time");
        }else if (firstConnectionHasBetterResponseTime(connectionInfo2,connectionInfo1, 50)) {
            betterConnection = connectionInfo2;
            logger.finest("second connection has been chosen due to much better connection time");
        }else if (firstConnectionHasBetterNetworkRoute(connectionInfo1, connectionInfo2)) {
            betterConnection = connectionInfo1;
            logger.finest("first connection has been chosen due to better network route");
        }else if (firstConnectionHasBetterNetworkRoute(connectionInfo2, connectionInfo1)) {
            betterConnection = connectionInfo2;
            logger.finest("second connection has been chosen due to better connection time");
        }else if (connectionInfo1.serverAddress==preferredServer) {
            betterConnection = connectionInfo1;
            logger.finest("first connection has been chosen because because it's server is a preferred one");
        }else if (connectionInfo2.serverAddress==preferredServer) {
            betterConnection = connectionInfo2;
            logger.finest("second connection has been chosen because because it's server is a preferred one");
        }else if (firstConnectionHasBetterResponseTime(connectionInfo1,connectionInfo2, 0)) {
            betterConnection = connectionInfo1;
            logger.finest("first connection has been chosen due to better connection time");
        }else {
            betterConnection = connectionInfo2;
            logger.finest("second connection has been chosen due to better connection time");
        }

        logger.logMethodCompleted(arguments, betterConnection, eLogLevel.finer);

        return betterConnection;
    }

    function onRegistrationStateChanged(event, registrationStateInfo) {

        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        try {
            var proxyConfigReference = registrationStateInfo.proxyConfigReference;
            var registrationState = registrationStateInfo.registrationState;
            var message = registrationStateInfo.message;
            var connectionInfo = findConnectionInfo(proxyConfigReference);
            if (connectionInfo!=null) {
                if (state==eState.searching) {
                    if (registrationState == 'RegistrationOk' && connectionInfo.state=='RegistrationProgress') {
                        connectionInfo.state = 'RegistrationOk';
                        numOfResponses++;
                        connectionInfo.registerResponseArrivedAt =  new Date().getTime();
                        if (foundConnection==null) {
                            foundConnection = connectionInfo;
                            if (connectionInfo.serverAddress == preferredServer
                                && connectionInfo.proxyAddress==null) {
                                onSearchCompleted();
                            }else {
                                resetTimer(onSearchTimeout, 500);
                            }
                        }else {
                            foundConnection = chooseBetterConnection(foundConnection, connectionInfo);
                            if (numOfResponses==connections.length) {
                                onSearchCompleted();
                            }
                        }
                    } else if (registrationState == 'RegistrationProgress') {
                        connectionInfo.state = registrationState; 
                        connectionInfo.registerRequestIssuedAt = new Date().getTime();
                    } else if (registrationState == 'RegistrationFailed') {
                        if (!connectionInfo.state || connectionInfo.state=='RegistrationProgress') {
                            numOfResponses++;
                            if (numOfResponses==connections.length) {
                                onSearchCompleted();
                            }
                        }
                        connectionInfo.state=registrationState;
                    } 
                } else if (state==eState.disconnecting) {
                    if (registrationState == 'RegistrationOk' && connectionInfo.state!=='RegistrationOk') {
                        connectionInfo.state='RegistrationOk';
                        JSBridge.terminateRegistration(connectionInfo.proxyConfigReference);
                    }else if (registrationState=="RegistrationCleared") {
                        connectionInfo.state="RegistrationCleared";
                        if (!activeConnectionExists()) {
                            onDisconnectCompleted();
                        }
                    }
                }
            }


        }catch(err){
            logger.error(err);
        }


        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }

    function cancel() {

        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);


        try {

            if (timeout) {
                $timeout.cancel(timeout);
                timeout = null;
            }

            for (var i=0;i<connections.length;i++) {
                var connectionInfo = connections[i];
                if (connectionInfo.proxyConfigReference) {
                    JSBridge.removeProxyConfig(connectionInfo.proxyConfigReference);
                }
            }

            endpointId = null;
            connections = [];


        }catch(err){
            logger.error(err);
        }


        logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
    }


    this._getMembers=getMembers;
    this._findConnectionInfo=findConnectionInfo;
    this._activeConnectionExists=activeConnectionExists;
    this._resetTimer=resetTimer;
    this._register=register;
    this._onDisconnectTimeout=onDisconnectTimeout;
    this._onSearchTimeout=onSearchTimeout;
    this._onDisconnectCompleted=onDisconnectCompleted;
    this._onSearchCompleted=onSearchCompleted;
    this._firstConnectionHasBetterResponseTime=firstConnectionHasBetterResponseTime;
    this._firstConnectionHasBetterNetworkRoute=firstConnectionHasBetterNetworkRoute;
    this._chooseBetterConnection=chooseBetterConnection;
    this._onRegistrationStateChanged=onRegistrationStateChanged;

    this.findAvailableConnection=findAvailableConnection;
    this.cancel = cancel;
}

var servicesModule = angular.module('aeonixApp.services');
servicesModule.service('connectionAddressFinderSrv', ['$rootScope', '$timeout', ConnectionAddressFinderSrv]);

