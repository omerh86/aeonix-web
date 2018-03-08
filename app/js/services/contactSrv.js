function ContactSrv($rootScope, infoSrv, pictureSrv, storageSrv, loginSrv) {

    var service = this;
    var serviceLogger = logSrv.getLogger("contactSrv");
    var allContacts = {
        group: [],
        serverUser: [],
        externalUser: [],
        voiceMail: [],
        other: []
    };
    var events = {};

    function resetAllContacts() {
        allContacts = {
            group: [],
            serverUser: [],
            externalUser: [],
            voiceMail: [],
            other: []
        }
    }

    function addOnConactsRecievedFromServer(handler) {
        _addEventListener("OnConactsRecievedFromServer", handler);
    }

    function removeOnConactsRecievedFromServer(handler) {
        _removeEventListener("OnConactsRecievedFromServer", handler);
    }

    function _addEventListener(name, handler) {
        if (events.hasOwnProperty(name))
            events[name].push(handler);
        else
            events[name] = [handler];
    };

    function _removeEventListener(name, handler) {
        /* This is a bit tricky, because how would you identify functions?
           This simple solution should work if you pass THE SAME handler. */
        if (!events.hasOwnProperty(name))
            return;

        var index = events[name].indexOf(handler);
        if (index != -1)
            events[name].splice(index, 1);
    };

    function _fireEvent(name, args) {
        if (!events.hasOwnProperty(name))
            return;

        if (!args || !args.length)
            args = [];

        var evs = events[name], l = evs.length;
        for (var i = 0; i < l; i++) {
            evs[i].apply(null, args);
        }
    };

    function getCurrentUserName() {
        return loginSrv.getUserName();
    }

    function loadPersistedContacts() {
        var list = storageSrv.getAllValuesOfCategory(getCurrentUserName(), "contactSrv:contact");

        if (list && list.length > 0) {
            for (var i = 0; i < list.length; i++) {
                var persistentContact = list[i];
                var contact = addOrUpdateContactWithContactInfo(persistentContact.contact);
                contact.internal.persistent = true;
            }
        }
    }


    function getContactFromServerByNumber(number) {
        var obj = {
            GetContact: {
                alias: number
            }
        };
        infoSrv.sendRequest(obj);

    };

    function getContactFromServerByUserName(userName) {
        var obj = {
            GetContact: {
                userName: userName
            }
        };
        infoSrv.sendRequest(obj);
    };

    function getContactFromServer(contact) {
        if (contact.getAlias()) {
            getContactFromServerByNumber(contact.getAlias());
        } else if (isSearchableUserName(contact.contact.userName)) {
            getContactFromServerByUserName(contact.contact.userName);
        } else {
            logger.finest("Both alias and userName are empty. No request will be sent to the server");
        }

    }

    function isSearchableUserName(userName) {
        return (userName && userName != "");
    }

    function getRawContactsFromDevice(filter, searchByNumberOnly, isStrictSearch) {
        deviceRawContacts = [];
        if (searchByNumberOnly) {
            deviceRawContacts = JSBridge.getContactIdByPhoneNumber(filter);
        } else {
            deviceRawContacts = JSBridge.getPhoneContactsByName(filter);
            deviceRawContacts = deviceRawContacts.concat(JSBridge.getContactIdByPhoneNumber(filter));
        }
        if (isStrictSearch) {
            deviceRawContacts = _.filter(deviceRawContacts, function (i) {
                return i.phoneNumbers[0] == filter;
            });
        }
        return deviceRawContacts;
    }

    function findDeviceContacts(number) {
        var deviceContacts = _getContactsByNumber(allContacts.externalUser, number, true);
        if (deviceContacts.length == 0) {
            //No device contact in cache... find in device
            deviceRawContacts = getRawContactsFromDevice(number, true, true);
            deviceRawContacts.forEach(function (i) {
                var contact = addOrUpdateContactWithDeviceRawContact(i);
                deviceContacts.push(contact);
            });
        }
        return deviceContacts;
    }

    function getContactsByNumber(number) {
        var resultContacts = [];
        var deviceContacts = findDeviceContacts(number);

        resultContacts = deviceContacts;
        var serverContacts = _getContactsByNumber(allContacts.serverUser, number, false);

        if (serverContacts.length == 0) {
            //No server contact in cache
            if (deviceContacts.length == 0 && serverContacts.length == 0) {
                //create new contact
                var contact = Contact.createFromAlias(number);
                resultContacts.push(contact);
                addOrUpdateContact(contact);
            }
            getContactFromServerByNumber(number);
        } else {
            resultContacts = resultContacts.concat(serverContacts);
        }
        return resultContacts;
    }

    function getServerContactByUserName(userName) {
        var serverCacheContacts = _getContactsByName(allContacts.serverUser, userName, false);
        if (serverCacheContacts.length == 0) {
            contact = Contact.createFromUserName(userName);
            contact = addOrUpdateContact(contact);
            serverCacheContacts.push(contact);
            getContactFromServer(contact);
        }
        return serverCacheContacts[0];
    }

    function getServerContactByNumber(number) {
        var serverCacheContacts = _getContactsByNumber(allContacts.serverUser, number, false);
        if (serverCacheContacts.length == 0) {
            contact = Contact.createFromAlias(number);
            contact = addOrUpdateContact(contact);
            serverCacheContacts.push(contact);
            getContactFromServer(contact);
        }
        return serverCacheContacts[0];
    }

    function getCacheContactsByContactId(contactId) {
        var serverCacheContacts = [];
        if (contactId.idType.value == eIdType.alias.value) {
            serverCacheContacts = _getContactsByNumber(allContacts.serverUser, contactId.id, false);
            serverCacheContacts = serverCacheContacts.concat(_getContactsByNumber(allContacts.externalUser, contactId.id, true));

        } else {
            serverCacheContacts = _getContactsByName(allContacts.serverUser, contactId.id, false);
            serverCacheContacts = serverCacheContacts.concat(_getContactsByName(allContacts.externalUser, contactId.id, true));
        }
        return serverCacheContacts;
    }

    function getCacheContactsByNumber(number) {
        var serverCacheContacts = [];
        serverCacheContacts = _getContactsByNumber(allContacts.serverUser, number, false);
        serverCacheContacts = serverCacheContacts.concat(_getContactsByNumber(allContacts.externalUser, number, true));
        return serverCacheContacts;
    }

    function getCacheContactByUserName(userName) {
        var contact = _getContactByUserName(allContacts.serverUser, userName, false);
        if (!contact) {
            contact = _getContactByUserName(allContacts.externalUser, userName, true);
        }
        return contact;
    }

    function addOrUpdateContact(contact) {
        if (contact.internal.type.isGroup) {
            contact = _doAddOrUpdate(allContacts.group, contact);
        } else {

            switch (contact.internal.type.name) {
                case "user":
                case "unknown":
                    contact = _doAddOrUpdate(allContacts.serverUser, contact);
                    break;
                case "external":
                    contact = _doAddOrUpdate(allContacts.externalUser, contact);
                    break;
                case "voiceMail":
                    contact = _doAddOrUpdate(allContacts.voiceMail, contact);
                    break;
                default:
                    contact = _doAddOrUpdate(allContacts.other, contact);
                    break;
            }
        }

        if (contact.internal.persistent) {
            storageSrv.addOrUpdate(getCurrentUserName(), "contactSrv:contact", contact.getContactId().toString(), contact);
        }
        return contact;
    }

    function addOrUpdateContactWithGroupInfo(groupInfo) {

        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        var contact = Contact.createFromServerGroupInfo(groupInfo);
        contact = addOrUpdateContact(contact);

        logger.logMethodCompleted(arguments, contact, eLogLevel.finer);

        return contact;
    }

    function addOrUpdateContactWithContactInfo(contactInfo, presenceInfo) {

        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        var picture = pictureSrv.getPicture(contactInfo.userName, contactInfo.imageSignature)
        var contact = Contact.createFromServerContactInfo(contactInfo, presenceInfo, pictureSrv);
        contact = addOrUpdateContact(contact);

        logger.logMethodCompleted(arguments, contact, eLogLevel.finer);

        return contact;
    }

    function addOrUpdateContactWithDeviceRawContact(deviceRawContact) {
        var contact = Contact.createExternal(deviceRawContact.displayName, deviceRawContact.phoneNumbers, deviceRawContact.thumbnailIcon);

        contact = addOrUpdateContact(contact);
        return contact;
    }


    function persist(contact) {
        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);

        if (!contact.internal.persistent) {
            storageSrv.addOrUpdate(getCurrentUserName(), "contactSrv:contact", contact.getContactId().toString(), contact);
            contact.internal.persistent = true;
        }
    }


    function updateContactPresence(presence) {
        var contacts = [];

        if (presence.idType === "userID") {
            contacts = _getContactsByName(allContacts.serverUser, presence.device.deviceIdentifier, false);
            contacts = contacts.concat(_getContactsByName(allContacts.externalUser, presence.device.deviceIdentifier, true))
        } else {
            contacts = _getContactsByNumber(allContacts.serverUser, presence.device.deviceIdentifier, false);
            contacts = contacts.concat(_getContactsByNumber(allContacts.externalUser, presence.device.deviceIdentifier, true))

        }
        _.forEach(contacts, function (i) {
            i.internal.status = UserStatusInfo.fromCstaPresenceState(presence.presenceState);
        });
    }

    function refreshPresence(contactList) {
        var userNameList = [];
        var aliasList = [];

        for (var i = 0; i < contactList.length; i++) {
            var contact = contactList[i];
            if (contact.internal.type == eContactType.user) {
                userNameList.push(contact.contact.userName);
            } else if (contact.internal.type.isGroup) {
                aliasList.push(contact.getAlias());
            }
        }

        if (userNameList.length > 0 || aliasList.length > 0) {
            var request = {
                GetPresences: {
                    userIDList: userNameList,
                    aliasList: aliasList
                }
            };
            infoSrv.sendRequest(request);
        }
    }

    function onContactResponse(event, contactList, request) {

        var logger = serviceLogger.logMethodCall(arguments, eLogLevel.finer);
        var contacts = [];
        try {
            if (contactList.length) {
                for (var i = 0; i < contactList.length; i++) {
                    var contactInfo = contactList[i];
                    var contact = addOrUpdateContactWithContactInfo(contactInfo);
                    contacts.push(contact);
                    $rootScope.$broadcast("contactSrv:contactUpdated", contact);
                }
                if (request.GetContact.alias) {
                    if (contacts[0].contact.extAliases && contacts[0].contact.extAliases[0]) {
                        contacts = contacts.concat(findDeviceContacts(contacts[0].contact.extAliases[0]))
                    }
                    _fireEvent('OnConactsRecievedFromServer', [{ number: request.GetContact.alias, list: contacts }]);
                }
            }

        } catch (err) {
            logger.error(err);
        }
    }

    function onLoggedOut(event, loginSrv) {
        try {
            resetAllContacts();
        } catch (err) {
            logger.error(err);
        }
    }

    function onLoggedIn(event, loggedInWithEndpoint) {

        try {
            if (loggedInWithEndpoint) {
                loadPersistedContacts();
            }
        } catch (err) {
            logger.error(err);
        }
    }

    function onPictureUpdated(event, userName, pictureInfo) {
        var contacts = _getContactsByName(allContacts.serverUser, userName, false);
        _.forEach(contact, function (i) {
            i.contact.imageSignature = pictureInfo.signature;
            i.contact.img = ictureInfo.picture;
            i.internal.img = pictureInfo.picture;
            i.internal.imgBig = pictureInfo.picture;
        });
    }

    function onPresenceStateEvent(event, presence) {
        try {
            updateContactPresence(presence);
        } catch (err) {
            logger.error(err);
        }
    }

    function onPresencesListResponse(event, presenceList) {
        try {
            for (var i = 0; i < presenceList.length; i++) {
                var presence = presenceList[i];
                updateContactPresence(presence);

            }
        } catch (err) {
            logger.error(err);
        }
    }

    function _doAddOrUpdate(collection, contact) {
        var relevant = _.find(collection, function (i) {
            return i.contact.userName == contact.contact.userName;
        })
        if (relevant) {
            relevant.internal.status = contact.internal.status;
            relevant.internal.type = contact.internal.type;
            relevant.contact = contact.contact;
            return relevant;
        } else {
            collection.push(contact);
            return contact;
        }
    }

    function getAllContacts() {
        return allContacts;

    }

    function getContactsByPartialAlias(partialAlias) {
        var contacts = [];
        contacts = _getContactsByPartialName(allContacts.serverUser, partialAlias, false);
        contacts = contacts.concat(_getContactsByPartialNumber(allContacts.serverUser, partialAlias, false));
        contacts = contacts.concat(_getContactsByPartialName(allContacts.externalUser, partialAlias, true));
        contacts = contacts.concat(_getContactsByPartialNumber(allContacts.externalUser, partialAlias, true));
        return _.sortBy(_.uniq(_.filter(contacts, function (j) {
            return j.internal.type.name != "unknown";
        }), function (k) {
            return k.contact.userName;
        }), function (i) { return i.contact.displayName });
    }

    function _getContactsByPartialName(collectionOfcontacts, name, isExternalContact) {
        return _.filter(collectionOfcontacts, function (i) {
            if (i.contact.displayName.toLowerCase().indexOf(name.toLowerCase()) > -1) {
                _updateContactLastSearchKey(i, i.contact.aliases[0] && i.contact.aliases[0].completeAliasName ? i.contact.aliases[0].completeAliasName : i.contact.extAliases[0], isExternalContact)
                return i;
            }
        });
    }

    function _getContactsByName(collectionOfcontacts, name, isExternalContact) {
        return _.filter(collectionOfcontacts, function (i) {
            if (i.contact.displayName.toLowerCase() == name.toLowerCase()) {
                _updateContactLastSearchKey(i, i.contact.aliases[0] && i.contact.aliases[0].completeAliasName ? i.contact.aliases[0].completeAliasName : i.contact.extAliases[0], isExternalContact)
                return i;
            }
        });
    }

    function _getContactByUserName(collectionOfcontacts, name, isExternalContact) {
        return _.find(collectionOfcontacts, function (i) {
            if (i.contact.userName.toLowerCase() == name.toLowerCase()) {
                _updateContactLastSearchKey(i, i.contact.aliases[0] && i.contact.aliases[0].completeAliasName ? i.contact.aliases[0].completeAliasName : i.contact.extAliases[0], isExternalContact)
                return i;
            }
        });
    }

    function _getContactsByPartialNumber(collectionOfcontacts, number, isExternalContact) {
        var relevantContacts = [];
        var numbers = [];
        for (var i = 0; i < collectionOfcontacts.length; i++) {
            if (collectionOfcontacts[i].contact.aliases && collectionOfcontacts[i].contact.aliases.length) {
                numbers = _.map(collectionOfcontacts[i].contact.aliases, "completeAliasName");
            }
            if (collectionOfcontacts[i].contact.extAliases) {
                numbers = numbers.concat(collectionOfcontacts[i].contact.extAliases);
            }
            var relevantNumber = _.find(numbers, function (i) {
                return i.indexOf(number) > -1;
            });
            if (relevantNumber) {
                _updateContactLastSearchKey(collectionOfcontacts[i], relevantNumber, isExternalContact)
                relevantContacts.push(collectionOfcontacts[i]);
            }
        }
        return relevantContacts;
    }

    function _getContactsByNumber(collectionOfcontacts, number, isExternalContact) {
        var relevantContacts = [];
        var numbers = [];
        for (var i = 0; i < collectionOfcontacts.length; i++) {
            numbers = _.map(collectionOfcontacts[i].contact.aliases, "completeAliasName");
            numbers = numbers.concat(collectionOfcontacts[i].contact.extAliases);
            var relevantNumber = _.find(numbers, function (i) {
                return i == number;
            });
            if (relevantNumber) {
                _updateContactLastSearchKey(collectionOfcontacts[i], relevantNumber, isExternalContact)
                relevantContacts.push(collectionOfcontacts[i]);
            }
        }
        return relevantContacts;
    }


    function _updateContactLastSearchKey(contact, lastSearchKey, isExternalContact) {
        contact.internal.lastSearchKey = lastSearchKey + (isExternalContact ? " (From device)" : " (From aeonix)");
    }

    function getAllFavorites() {
        var allFav = _doGetAllFavorites(allContacts.serverUser);
        allFav.concat(_doGetAllFavorites(allContacts.externalUser));
        allFav.concat(_doGetAllFavorites(allContacts.group));
        return _.uniq(allFav, function (i) {
            return i.contact.displayName;
        });
    }

    function getAllGroups() {

        return _.groupBy(allContacts.group, function (i) {
            return i.contact.displayName;
        });
    }

    function _doGetAllFavorites(collection) {
        return _.filter(collection, function (i) {
            return i.internal.isFav == true;
        });
    }



    $rootScope.$on("infoSrv:PresenceStateEvent", onPresenceStateEvent);
    $rootScope.$on("presencesList:update", onPresencesListResponse);
    $rootScope.$on("pictureSrv:pictureUpdated", onPictureUpdated);
    $rootScope.$on("infoSrv:contactResponse", onContactResponse);
    $rootScope.$on("loginSrv:loggedOut", onLoggedOut);
    $rootScope.$on("loginSrv:loggedIn", onLoggedIn);


    this._loadPersistedContacts = loadPersistedContacts;
    this.getContactFromServerByNumber = getContactFromServerByNumber;
    this._getContactFromServerByUserName = getContactFromServerByUserName;
    this._getContactFromServer = getContactFromServer;
    this._isSearchableUserName = isSearchableUserName;
    this._addOrUpdateContact = addOrUpdateContact;
    this._updateContactPresence = updateContactPresence;

    this._onContactResponse = onContactResponse;
    this._onLoggedOut = onLoggedOut;
    this._onLoggedIn = onLoggedIn;
    this._onPictureUpdated = onPictureUpdated;
    this._onPresenceStateEvent = onPresenceStateEvent;
    this._onPresencesListResponse = onPresencesListResponse;

    this.addOrUpdateContactWithContactInfo = addOrUpdateContactWithContactInfo;
    this.addOrUpdateContactWithGroupInfo = addOrUpdateContactWithGroupInfo;
    this.persist = persist;
    this.refreshPresence = refreshPresence;
    // this.getPhoneContacts = getPhoneContacts;
    this.addOrUpdateContactWithDeviceRawContact = addOrUpdateContactWithDeviceRawContact;
    this.getAllContacts = getAllContacts
    this.getAllFavorites = getAllFavorites
    this.getAllGroups = getAllGroups
    this.getContactsByPartialAlias = getContactsByPartialAlias
    this.addOnConactsRecievedFromServer = addOnConactsRecievedFromServer
    this.removeOnConactsRecievedFromServer = removeOnConactsRecievedFromServer
    this.getContactsByNumber = getContactsByNumber
    this.getRawContactsFromDevice = getRawContactsFromDevice
    this.findDeviceContacts = findDeviceContacts
    this.getServerContactByNumber = getServerContactByNumber
    this.getServerContactByUserName = getServerContactByUserName;
    this.getCacheContactByUserName = getCacheContactByUserName;
    this.getCacheContactsByContactId = getCacheContactsByContactId;
    this.getCacheContactsByNumber = getCacheContactsByNumber;
    //todo michael add releaseContact


}


var servicesModule = angular.module('aeonixApp.services');

servicesModule.service('contactSrv', ['$rootScope', 'infoSrv', 'pictureSrv', 'storageSrv', 'loginSrv', ContactSrv]);