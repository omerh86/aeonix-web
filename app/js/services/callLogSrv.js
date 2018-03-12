function CallLogSrv($rootScope, infoSrv, contactSrv, loginSrv) {

    var serviceLogger = logSrv.getLogger("callLogSrv");

    try {

        var allCallsLog = [];
        var missedCallsLog = [];
        var missedCallsCounter = new CommonCounter();

        contactSrv.addOnConactsRecievedFromServer(onContactsRecieved);

        function onContactsRecieved(response) {
            var relevantCallsogObjs = _.filter(allCallsLog, function (i) {
                return i.user.internal.number == response.number;
            });
            if (relevantCallsogObjs.length) {
                response.list.push(relevantCallLogObj[0].user);
                var contact = _modifyCalllogContact(response.list, response.number);
                _.forEach(relevantCallsogObjs, function (i) {
                    i.user = contact;
                });

            }
        }

        function getCurrentUserName() {
            return loginSrv.getUserName();
        }

        function resetMembers() {

            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            if (allCallsLog.length > 0) {
                allCallsLog.splice(0, allCallsLog.length);
            }
            if (missedCallsLog.length > 0) {
                missedCallsLog.splice(0, missedCallsLog.length);
            }
            missedCallsCounter.reset();
        }
        function getMembers() {
            var o = {
                "allCallsLog": allCallsLog,
                "missedCallsLog": missedCallsLog,
                "missedCallsCounter": missedCallsCounter
            };
            return o;
        }

        function isConnected() {
            return loginSrv.getState() == eLoginState.loggedIn && loginSrv.isLoggedInWithEndpoint();
        }

        function sendGetCallLogRequest(start, end, missedCallsOnly) {

            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            var request = {
                GetCallLog: {
                    userName: getCurrentUserName(),
                    start: start,
                    end: end,
                    selectedIntervalType: "groupedCalls",
                    dismissMissedCalls: false
                }
            };

            if (missedCallsOnly) {
                request.GetCallLog.callType = "INCOMING";
                request.GetCallLog.callLogCallType = "NOANSWERED";
            }

            infoSrv.sendRequest(request);
        }


        function getLog(missedCallsOnly) {
            if (missedCallsOnly) {
                return missedCallsLog;
            } else {
                return allCallsLog;
            }
        }

        function getMissedCallsCounter() {
            return missedCallsCounter;
        }

        function loadCallLog(missedCallsOnly) {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            if (isConnected()) {
                var log = getLog(missedCallsOnly);
                if (log.length > 0) {
                    log.splice(0, log.length);
                }
                sendGetCallLogRequest(0, 19, missedCallsOnly);
            }
            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }

        function loadMoreLogRecords(missedCallsOnly) {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            if (isConnected()) {
                var log = getLog(missedCallsOnly);
                sendGetCallLogRequest(log.length, log.length + 19);
            }

            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }

        function dismissMissedCalls() {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            missedCallsCounter.reset();

            var request = {
                DismissMissedCalls: {
                    userName: getCurrentUserName()
                }
            };

            infoSrv.sendRequest(request);

            $rootScope.$broadcast("callLogSrv:missedCallsDismissed");

            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }


        function removeRecord(index, missedCallsOnly) {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            var log = getLog(missedCallsOnly);
            var record = log[index];
            var idList = [];
            for (var i = 0; i < record.callLog.length; i++) {
                idList.push(record.callLog[i].callLogID);
            }
            log.splice(index, 1);
            var request = {
                "RemoveFromCallLog": {
                    "userName": getCurrentUserName(),
                    "callLogIds": idList
                }
            };
            infoSrv.sendRequest(request);
            sendGetCallLogRequest(log, log.length + 1, missedCallsOnly);
            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }



        function onLoggedOut() {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            try {
                resetMembers();
            } catch (err) {
                logger.error(err);
            }




            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }

        function onLoggedIn() {



        }

        function onConnectionRestored() {

        }

        function onCallLogNotification(event, notification) {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            try {
                var newCallsNumber = Number(notification.newCallsNumber);
                var newMissedCalls = Number(notification.newMissedCalls);

                missedCallsCounter.set(newMissedCalls);


                var newCallsInfo = {
                    newCallsNumber: newCallsNumber,
                    newMissedCalls: newMissedCalls
                };

                $rootScope.$broadcast("callLogSrv:newCalls", newCallsInfo);
            } catch (err) {
                logger.error(err);
            }



            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }

        function populateCallLog(log, callLogRecords) {

            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);
            var records = callLogRecords.recentRecordInfo;
            if (records && records.length && records.length > 0) {
                for (var i = 0; i < records.length; i++) {
                    var user = null;
                    var contact = records[i].contact;
                    var presence;
                    if (records[i].presenceState) {
                        presence = records[i].presenceState.presence;
                    }

                    var isRestricted = records[i].callLogList[0].isRestricted;
                    var isExternal = records[i].callLogList[0].isExternal;
                    var alias2Dial = records[i].callLogList[0].alias2Dial;
                    var remoteName = records[i].callLogList[0].remoteName;

                    if (isRestricted) {
                        user = Contact.anonymousContact;
                    } else if (isExternal) {
                        var contacts = contactSrv.getContactsByNumber(remoteName);

                        user = _modifyCallLogContact(contacts, alias2Dial);
                    } else {
                        if (contact) {
                            user = contactSrv.addOrUpdateContactWithContactInfo(contact, presence);
                            if (user.contact.extAliases && user.contact.extAliases[0]) {
                                var contacts = contactSrv.findDeviceContacts(user.contact.extAliases[0]);
                                contacts.unshift(user);
                                user = _modifyCallLogContact(contacts, alias2Dial);
                            }
                        }
                    }

                    var callLogID = records[i].callLogList[0].callLogID;

                    var record = {
                        hasDateTitle: false,
                        user: user,
                        callLog: records[i].callLogList,
                        callLogID: callLogID
                    };
                    if (i > 0) {
                        var date1 = new Date(log[i - 1].callLog[0].startTime);
                        var date2 = new Date(record.callLog[0].startTime);

                        var time1 = (date1.getFullYear() + '|y|') + (date1.getMonth() + '|m|') + (date1.getDate() + '|d|');
                        var time2 = (date2.getFullYear() + '|y|') + (date2.getMonth() + '|m|') + (date2.getDate() + '|d|');
                        if (time1 != time2) {
                            record.hasDateTitle = true;
                        }
                    } else {
                        record.hasDateTitle = true;
                    }

                    log.push(record);
                }
            }
        }

        function _modifyCallLogContact(listOfContacts, number) {
            var s = "img/user-placeholder-big.png"
            var contact = listOfContacts[0];
            if (!contact.internal.img || contact.internal.img == s || !contact.internal.displayName) {
                _.forEach(listOfContacts, function (i) {
                    if (contact.internal.img == s && i.contact.img != s) {
                        contact.internal.img = i.contact.img

                    }
                    if (!contact.internal.displayName && i.contact.displayName) {
                        contact.internal.displayName = i.contact.displayName
                    }
                });
            }
            contact.internal.number = number;
            return contact;
        }

        function onCallLogRecords(event, response, request) {
            var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

            try {
                resetMembers();
                var log;
                if (request.GetCallLog.callLogCallType === "NOANSWERED") {
                    log = missedCallsLog;
                } else {
                    log = allCallsLog;
                }

                populateCallLog(log, response.CallLogRecords);
            } catch (err) {
                logger.error(err);
            }



            logger.logMethodCompleted(arguments, getMembers(), eLogLevel.finer);
        }


        $rootScope.$on("loginSrv:loggedOut", onLoggedOut);
        $rootScope.$on("loginSrv:loggedIn", onLoggedIn);
        $rootScope.$on("loginSrv:connectionRestored", onConnectionRestored);
        $rootScope.$on("infoSrv:CallLogRecords", onCallLogRecords);
        $rootScope.$on("infoSrv:CallLogNotification", onCallLogNotification);


        this._getCurrentUserName = getCurrentUserName;
        this._resetMembers = resetMembers;
        this._getMembers = getMembers;
        this._isConnected = isConnected;
        this._sendGetCallLogRequest = sendGetCallLogRequest;


        this._onLoggedOut = onLoggedOut;
        this._onLoggedIn = onLoggedIn;
        this._onConnectionRestored = onConnectionRestored;
        this._onCallLogNotification = onCallLogNotification;
        this._onCallLogRecords = onCallLogRecords;

        this.getLog = getLog;
        this.removeRecord = removeRecord;
        this.loadCallLog = loadCallLog;
        this.loadMoreLogRecords = loadMoreLogRecords;
        this.dismissMissedCalls = dismissMissedCalls;
        this.getMissedCallsCounter = getMissedCallsCounter;

        serviceLogger.fine("callLogSrv service has been create successfully")
    } catch (err) {
        serviceLogger.error(err);
    }
}

var servicesModule = angular.module('aeonixApp.services');
servicesModule.service('callLogSrv', ['$rootScope', 'infoSrv', 'contactSrv', 'loginSrv', CallLogSrv]);