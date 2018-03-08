var controllersModule = angular.module('aeonixApp.controllers');

controllersModule.controller('deleteChatModalController', ['$scope', '$modalInstance','contact',
    function ($scope, $modalInstance,contact) {
        $scope.contact = contact
        //todo michael: extract building user's display name to a single function
        $scope.displayName = $scope.contact.contact.displayName

        $scope.closeModal = function (isDelete) {
            $modalInstance.close(isDelete);
        };
    }]);
