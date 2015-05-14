"use strict";
var productizationApp = soajsApp.components;
productizationApp.controller('productCtrl', ['$scope', '$timeout', '$modal', '$routeParams', 'ngDataApi', function($scope, $timeout, $modal, $routeParams, ngDataApi) {
	$scope.$parent.isUserLoggedIn();

	$scope.access = {};
	constructModulePermissions($scope, $scope.access, productizationConfig.permissions);

	$scope.viewPackage = function(pack) {
		pack.showDetails = true;
	};
	$scope.closePackage = function(pack) {
		pack.showDetails = false;
	};

	$scope.listProducts = function() {
		getSendDataFromServer($scope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/product/list"
		}, function(error, response) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.grid = {
					rows: response
				};

				$scope.grid.actions = {
					'edit': {
						'label': 'Edit',
						'command': function(row) {
							$scope.editProduct(row);
						}
					},
					'delete': {
						'label': 'Remove',
						'commandMsg': "Are you sure you want to remove this product ?",
						'command': function(row) {
							$scope.removeProduct(row);
						}
					}
				};
			}
		});
	};

	$scope.removeProduct = function(row) {
		getSendDataFromServer($scope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/product/delete",
			"params": {"id": row._id}
		}, function(error) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.$parent.displayAlert('success', "Product removed successfully.");
				$scope.listProducts();
			}
		});
	};

	$scope.addProduct = function() {
		var options = {
			timeout: $timeout,
			form: productizationConfig.form.product,
			type: 'product',
			name: 'addProduct',
			label: 'Add New Product',
			actions: [
				{
					'type': 'submit',
					'label': 'Add Product',
					'btn': 'primary',
					'action': function(formData) {
						var postData = {
							'code': formData.code,
							'name': formData.name,
							'description': formData.description
						};
						getSendDataFromServer($scope, ngDataApi, {
							"method": "send",
							"routeName": "/dashboard/product/add",
							"data": postData
						}, function(error) {
							if(error) {
								$scope.form.displayAlert('danger', error.message);
							}
							else {
								$scope.$parent.displayAlert('success', 'Product Added Successfully.');
								$scope.modalInstance.close();
								$scope.form.formData = {};
								$scope.listProducts();
							}
						});
					}
				},
				{
					'type': 'reset',
					'label': 'Cancel',
					'btn': 'danger',
					'action': function() {
						$scope.modalInstance.dismiss('cancel');
						$scope.form.formData = {};
					}
				}]
		};

		buildFormWithModal($scope, $modal, options);
	};

	$scope.editProduct = function(row) {

		var formConfig = {};
		formConfig.form = angular.copy(productizationConfig.form.product);
		formConfig.form.entries[0].type = 'readonly';
		formConfig.name = 'editProduct';
		formConfig.label = 'Edit Product';
		formConfig.timeout = $timeout;

		var keys = Object.keys(row);
		for(var i = 0; i < formConfig.form.entries.length; i++) {
			keys.forEach(function(inputName) {
				if(formConfig.form.entries[i].name === inputName) {
					formConfig.form.entries[i].value = row[inputName];
				}
			});
		}

		formConfig.actions = [
			{
				'type': 'submit',
				'label': 'Edit Product',
				'btn': 'primary',
				'action': function(formData) {
					var postData = {
						'name': formData.name,
						'description': formData.description
					};
					getSendDataFromServer($scope, ngDataApi, {
						"method": "send",
						"routeName": "/dashboard/product/update",
						"data": postData,
						"params": {"id": row['_id']}
					}, function(error) {
						if(error) {
							$scope.$parent.displayAlert('danger', error.message);
						}
						else {
							$scope.$parent.displayAlert('success', 'Product Updated Successfully.');
							$scope.modalInstance.close();
							$scope.form.formData = {};
							$scope.listProducts();
						}
					});
				}
			},
			{
				'type': 'reset',
				'label': 'Cancel',
				'btn': 'danger',
				'action': function() {
					$scope.modalInstance.dismiss('cancel');
					$scope.form.formData = {};
				}
			}];

		buildFormWithModal($scope, $modal, formConfig);
	};

	$scope.reloadPackages = function(productId) {
		getSendDataFromServer($scope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/product/packages/list",
			"params": {"id": productId}
		}, function(error, response) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				for(var i = 0; i < $scope.grid.rows.length; i++) {
					if($scope.grid.rows[i]['_id'] === productId) {
						$scope.grid.rows[i].packages = response;
					}
				}
			}
		});
	};

	$scope.addPackage = function(productId) {
		var formConf = angular.copy(productizationConfig.form.package);
		formConf.entries.forEach(function(oneEn) {
			if(oneEn.type==='select'){
				oneEn.value[0].selected=true;
			}
		});

		var options = {
			timeout: $timeout,
			form: formConf,
			name: 'addPackage',
			label: 'Add New Package',
			sub: true,
			actions: [
				{
					'type': 'submit',
					'label': 'Add Package',
					'btn': 'primary',
					'action': function(formData) {
						var postData = {
							'code': formData.code,
							'name': formData.name,
							'description': formData.description,
							'_TTL': Array.isArray(formData._TTL) ? formData._TTL.join("") : formData._TTL
						};

						postData.acl = {};
						getSendDataFromServer($scope, ngDataApi, {
							"method": "send",
							"routeName": "/dashboard/product/packages/add",
							"data": postData,
							"params": {"id": productId}
						}, function(error) {
							if(error) {
								$scope.form.displayAlert('danger', error.message);
							}
							else {
								$scope.$parent.displayAlert('success', 'Package Added Successfully.');
								$scope.modalInstance.close();
								$scope.form.formData = {};
								$scope.$parent.$emit('reloadProducts', {});
								$scope.reloadPackages(productId);
							}
						});
					}
				},
				{
					'type': 'reset',
					'label': 'Cancel',
					'btn': 'danger',
					'action': function() {
						$scope.modalInstance.dismiss('cancel');
						$scope.form.formData = {};
					}
				}
			]
		};
		buildFormWithModal($scope, $modal, options);
	};

	$scope.editPackAcl = function(productId, code) {
		$scope.$parent.go("/productization/"+productId+"/editAcl/" + code );
	};

	$scope.editPackage = function(productId, data) {
		var formConfig = angular.copy(productizationConfig.form.package);
		var recordData = angular.copy(data);
		delete recordData.acl;
		recordData._TTL = recordData._TTL / 3600000;

		formConfig.entries[0].type = 'readonly';
		var options = {
			timeout: $timeout,
			form: formConfig,
			name: 'editPackage',
			label: 'Edit Package',
			data: recordData,
			actions: [
				{
					'type': 'submit',
					'label': 'Edit Package',
					'btn': 'primary',
					'action': function(formData) {
						var postData = {
							'name': formData.name,
							'description': formData.description,
							'_TTL': Array.isArray(formData._TTL) ? formData._TTL.join("") : formData._TTL
						};
						postData.acl = data.acl;
						getSendDataFromServer($scope, ngDataApi, {
							"method": "send",
							"routeName": "/dashboard/product/packages/update",
							"data": postData,
							"params": {"id": productId, "code": data.code.split("_")[1]}
						}, function(error) {
							if(error) {
								$scope.form.displayAlert('danger', error.message);
							}
							else {
								$scope.$parent.displayAlert('success', 'Package Updated Successfully.');
								$scope.modalInstance.close();
								$scope.form.formData = {};
								$scope.reloadPackages(productId);
							}
						});
					}
				},
				{
					'type': 'reset',
					'label': 'Cancel',
					'btn': 'danger',
					'action': function() {
						$scope.modalInstance.dismiss('cancel');
						$scope.form.formData = {};
					}
				}
			]
		};

		buildFormWithModal($scope, $modal, options);
	};

	$scope.removeProductPackage = function(productId, packageCode) {
		packageCode = packageCode.split("_")[1];
		getSendDataFromServer($scope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/product/packages/delete",
			"params": {"id": productId, "code": packageCode}
		}, function(error) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.$parent.displayAlert('success', "Selected Package has been removed.");
				$scope.reloadPackages(productId);
			}
		});
	};

	//default operation
	if($scope.access.listProduct){
		$scope.listProducts();
	}

}]);

productizationApp.controller('aclCtrl', ['$scope', '$routeParams', 'ngDataApi', 'aclHelpers', function($scope, $routeParams, ngDataApi, aclHelpers) {
	$scope.$parent.isUserLoggedIn();

	$scope.allServiceApis=[];
	$scope.aclFill={};
	$scope.currentPackage = {};

	$scope.minimize =function(service){
		$scope.aclFill[service.name].collapse = true;
	};

	$scope.expand =function(service){
		$scope.aclFill[service.name].collapse = false;
	};

	$scope.selectService = function( service) {
		$scope.aclFill[service.name].collapse = !$scope.aclFill[service.name]['include'];
	};

	$scope.getPackageAcl = function() {
		getSendDataFromServer($scope, ngDataApi, {
			"method": "get",
			"routeName": "/dashboard/product/get",
			"params": { "id": $routeParams.pid }
		}, function (error, response) {
			if (error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				var code = $routeParams.code;
				for (var x = 0; x<response.packages.length; x++){
					if(response.packages[x].code === code){
						$scope.currentPackage = angular.copy(response.packages[x]);
						$scope.currentPackage._TTL = ($scope.currentPackage._TTL / 3600000).toString();
						break;
					}
				}

				$scope.aclFill= angular.copy($scope.currentPackage.acl);
				aclHelpers.fillAcl($scope.aclFill);
			}
		});
	};

	//default operation
	$scope.getAllServicesList = function() {
		var serviceNames = [];
		getSendDataFromServer($scope, ngDataApi, {
			"method": "send",
			"routeName": "/dashboard/services/list",
			"data": { "serviceNames":serviceNames }
		}, function (error, response) {
			if (error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				response.forEach(function(serv) {
					serv.fixList = aclHelpers.groupApisForDisplay( serv.apis , 'group');
					delete serv.apis;


				});

				$scope.allServiceApis = response;
				$scope.getPackageAcl();
			}
		});
	};

	$scope.saveACL=function(){
		var productId=  $routeParams.pid;
		var postData = $scope.currentPackage ;
		postData.acl = aclHelpers.constructAclFromPost($scope.aclFill);;

		getSendDataFromServer($scope, ngDataApi, {
			"method": "send",
			"routeName": "/dashboard/product/packages/update",
			"data": postData,
			"params": {"id": productId, "code": postData.code.split("_")[1]}
		}, function(error) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.$parent.displayAlert('success', 'ACL Updated Successfully.');
			}
		});
	};

	$scope.checkForGroupDefault=function(service,grp,val,myApi) {
		aclHelpers.checkForGroupDefault($scope, service,grp,val,myApi);
	};

	$scope.applyRestriction=function(service){
		aclHelpers.applyPermissionRestriction($scope, service);
	};

	// default operation
	$scope.getAllServicesList();
}]);
