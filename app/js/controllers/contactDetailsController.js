
function ContactDetailsLink(number, userName) {
    this.number = number;
    this.userName = userName;

}

ContactDetailsLink.prototype.goBack = function ($state) {
    var params = { number: this.number, userName: this.userName };
    $state.go('home.contactDetails', params);
}


function ContactDetailsController($rootScope, $scope, $state, $stateParams, favoritesSrv, backNavigationSrv, cstaMonitoringSrv, contactSrv, callsSrv) {

    var releaseQueue = [];
    var number = $stateParams.number;
    var userName = $stateParams.userName;
    init();

    $scope.makeCallToAlias = function (alias, isVideo) {
        callsSrv.makeCallToAlias(alias);
    };

    $scope.$on('$stateChangeStart', function onStateChangeStart(event, toState, toParams, fromState, fromParams, options) {
        if (!backNavigationSrv.isGoingBack()) {
            backNavigationSrv.addToBackStack(new ContactDetailsLink(number, userName));
        }
    })

    function onDestroy() {
        angularUtils.unregisterController("chatController");
        cstaMonitoringSrv.stopPresenceMonitors([$scope.contact]);

        for (var i = 0; i < releaseQueue.length; i++) {
            releaseQueue[i]();
        }
    }

    function modifyCallContact(listOfContacts, number) {
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

    function init() {
        number = $stateParams.number;
        userName = $stateParams.userName;
        if (userName) {
            $scope.contact = contactSrv.getCacheContactByUserName(userName);
            $scope.contacts = [$scope.contact];
        } else {
            $scope.contacts = contactSrv.getCacheContactsByNumber(number);
            $scope.contact = modifyCallContact($scope.contacts, number);
        }

        var names = "";
        _.forEach($scope.contacts, function (i) {
            names += (names ? ", " : "") + i.contact.displayName;
        });
        $scope.names = names;

        $scope.$on("$destroy", onDestroy);
        cstaMonitoringSrv.startPresenceMonitoring([$scope.contact]);
        $rootScope.showBack(true);
    }


}


var controllersModule = angular.module('aeonixApp.controllers');
controllersModule.controller('contactDetailsController', ['$rootScope', '$scope', '$state', '$stateParams', 'favoritesSrv', 'backNavigationSrv', 'cstaMonitoringSrv', 'contactSrv', 'callsSrv', ContactDetailsController]);