"use strict";
var environmentsApp = soajsApp.components;
environmentsApp.controller('platformsCtrl', ['$scope', '$cookies', 'envPlatforms', 'injectFiles', function ($scope, $cookies, envPlatforms, injectFiles) {
    $scope.$parent.isUserLoggedIn();

    $scope.access = {};
    constructModulePermissions($scope, $scope.access, environmentsConfig.permissions);

    $scope.platforms = [];

    $scope.dockerImagePath = "./themes/" + themeToUse + "/img/docker_logo.png";
    $scope.nginxImagePath = "./themes/" + themeToUse + "/img/nginx_logo.png";
    $scope.kubernetesImagePath = "./themes/" + themeToUse + "/img/kubernetes_logo.svg";

    $scope.deployer = {
        type: "",
        selected: ""
    };

    $scope.allowAddDriver = {};
    $scope.allowSelect = $scope.deployer.type === 'container';

    $scope.deployment = {
        newType: ""
    };

    $scope.jsoneditorConfig = environmentsConfig.jsoneditorConfig;
    $scope.jsoneditorConfig.onLoad = function (instance) {
        if (instance.mode === 'code') {
            instance.setMode('code');
        }
        else {
            instance.set();
        }

        instance.editor.getSession().on('change', function () {
            try {
                instance.get();
                $scope.jsoneditorConfig.jsonIsValid = true;
            }
            catch (e) {
                $scope.jsoneditorConfig.jsonIsValid = false;
            }
        });
    }

    $scope.listPlatforms = function (envCode) {
        envPlatforms.listPlatforms($scope, envCode, function () {
            $scope.listNginxCerts();
        });
    };

    $scope.editDriverConfig = function (driver) {
        envPlatforms.editDriverConfig($scope, driver);
    };

    $scope.uploadCerts = function (type, driverName) {
        envPlatforms.uploadCerts($scope, type, driverName);
    };

    $scope.removeCert = function (certId, driverName) {
        envPlatforms.removeCert($scope, certId, driverName);
    };

    $scope.clearDriverConfig = function (driverName) {
        envPlatforms.clearDriverConfig ($scope, driverName);
    };

    $scope.selectDriver = function (driverName) {
        envPlatforms.selectDriver ($scope, driverName, $scope.deployer.type);
    };

    $scope.addDriver = function () {
        envPlatforms.addDriver($scope);
    };

    $scope.editDriver = function (driver) {
        envPlatforms.editDriver($scope, driver);
    };

    $scope.changeDeployerType = function () {
        envPlatforms.changeDeployerType ($scope);
    };

    $scope.listNginxCerts = function () {
        envPlatforms.listNginxCerts($scope);
    };

    $scope.deleteNginxCert = function (certId) {
        envPlatforms.deleteNginxCert($scope, certId);
    };

    if ($scope.access.platforms.list) {
        $scope.envCode = $cookies.getObject("myEnv").code;
        injectFiles.injectCss("modules/DASHBOARD/environments/environments.css");
        $scope.listPlatforms($scope.envCode);
    }
}]);
