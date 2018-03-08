

var controllersModule = angular.module('aeonixApp.controllers');

function GroupsLink() { }

GroupsLink.prototype.goBack = function ($state) {
    $state.go('home.groups');
}


function GroupsController($rootScope, $scope, searchSrv, callLogSrv, backNavigationSrv, groupSrv, contactSrv) {

    var searchInstance = null;

    function init() {
        angularUtils.registerController('groupsController', this);

        $scope.searchInput = "";
        // $scope.groupList = groupSrv.getGroupList();
        contactSrv.addOnConactsRecievedFromServer(onContactsRecieved)
        $scope.groupList = contactSrv.getAllGroups();


        $scope.missedCallsCounter = callLogSrv.getMissedCallsCounter();

        $scope.searchInstance = searchSrv.createSearchInstance("groups");
        $rootScope.showBack(false);
    };

    function onContactsRecieved(list) {
        console.log(list);
    }

    $scope.search = function () {
        if ($scope.searchInput.length > 1) {
            searchSrv.search("groups", $scope.searchInput, false);
        } else {
            searchSrv.clearSearch("groups");
        }
    };

    $scope.loadMoreSearchItems = function () {
        searchSrv.loadMoreSearchResults("groups");
    };

    $scope.$on('$stateChangeStart', function onStateChangeStart(event, toState, toParams, fromState, fromParams, options) {
        if (!backNavigationSrv.isGoingBack()) {
            backNavigationSrv.addToBackStack(new GroupsLink());
        }
    })

    $scope.$on("$destroy", function () {
        contactSrv.removeOnConactsRecievedFromServer(onContactsRecieved);
        searchSrv.clearSearch("groups");

        angularUtils.unregisterController('groupsController');
    });

    init();

}

controllersModule.controller('groupsController', ['$rootScope', '$scope', 'searchSrv', 'callLogSrv', 'backNavigationSrv', 'groupSrv', 'contactSrv', GroupsController]);