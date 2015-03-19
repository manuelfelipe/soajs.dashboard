"use strict";
var myAccountApp = soajsApp.components;

myAccountApp.controller('changeSecurityCtrl', ['$scope', '$timeout', '$modal', 'ngDataApi', function($scope, $timeout, $modal, ngDataApi) {
	$scope.$parent.isUserLoggedIn();
	$scope.$parent.$on('xferData', function(event, args) {
		$scope.memberData = args.memberData;
	});
	$scope.changeEmail = function() {
		var config = changeEmailConfig.formConf;

		var options = {
			form: config,
			'timeout': $timeout,
			'name': 'changeEmail',
			'label': 'Change Email',
			'actions': {
				submit: function(formData) {
					var postData = {
						'email': formData.email
					};
					getSendDataFromServer(ngDataApi, {
						"method": "send",
						"routeName": "/urac/account/changeEmail",
						"params": {"uId": $scope.memberData._id},
						"data": postData
					}, function(error, response) {
						if(error) {
							$scope.form.displayAlert('danger', error.message);
						}
						else {
							$scope.$parent.displayAlert('success', 'A link will be sent to your new email address to validate the change.');
							$scope.modalInstance.close();
							$scope.form.formData = {};
						}
					});
				},
				cancel: function() {
					$scope.modalInstance.dismiss('cancel');
					$scope.form.formData = {};
				}
			}
		};
		buildFormWithModal($scope, $modal, options);
	};
	
	$scope.changePassword = function() {
		var config = changePwConfig.formConf;
		var options = {
			form: config,
			'timeout': $timeout,
			'name': 'changePassword',
			'label': 'Change Password',
			'actions': {
				submit: function(formData) {
					var postData = {
						'password': formData.password,
						'oldPassword': formData.oldPassword,
						'confirmation': formData.confirmPassword
					};
					if(formData.password != formData.confirmPassword) {
						$scope.form.displayAlert('danger', 'Your password and confirm password fields do not match!');
						return;
					}
					getSendDataFromServer(ngDataApi, {
						"method": "send",
						"routeName": "/urac/account/changePassword",
						"params": {"uId": $scope.memberData._id},
						"data": postData
					}, function(error, response) {
						if(error) {
							$scope.form.displayAlert('danger', error.message);
						}
						else {
							$scope.$parent.displayAlert('success', 'Password Updated Successfully.');
							$scope.modalInstance.close();
							$scope.form.formData = {};
						}
					});
				},
				cancel: function() {
					$scope.modalInstance.dismiss('cancel');
					$scope.form.formData = {};
				}
			}
		};
		buildFormWithModal($scope, $modal, options);
	};
}]);

myAccountApp.controller('myAccountCtrl', ['$scope', '$timeout', '$modal', 'ngDataApi', '$cookies', '$cookieStore', function($scope, $timeout, $modal, ngDataApi, $cookies, $cookieStore) {
	$scope.$parent.isUserLoggedIn();
	var userCookie = $cookieStore.get('soajs_user');
	
	var formConfig = {
		'timeout': $timeout,
		'name': 'editProfile',
		'label': 'Edit Profile',
		'entries': [],
		'data': {},
		'actions': {
			submit: function(formData) {
				if(formData.profile && (formData.profile != "")) {
					try {
						var profileObj = JSON.parse(formData.profile);
					}
					catch(e) {
						$scope.$parent.displayAlert('danger', 'Error: Invalid Profile Json object ');
						return;
					}
				}
				else {
					var profileObj = {};
				}

				var prof = JSON.stringify(profileObj);
				var postData = {
					'username': formData.username, 'firstName': formData.firstName, 'lastName': formData.lastName,
					'profile': prof
				};
				getSendDataFromServer(ngDataApi, {
					"method": "send",
					"routeName": "/urac/account/editProfile",
					"params": {"uId": $scope.userId},
					"data": postData
				}, function(error, response) {
					if(error) {
						$scope.$parent.displayAlert('danger', error.message);
					}
					else {
						$scope.$parent.displayAlert('success', 'Profile Updated Successfully.');
						userCookie.firstName = formData.firstName;
						userCookie.username = formData.username;
						userCookie.lastName = formData.lastName;
						userCookie.profile = profileObj;

						$cookieStore.put('soajs_user', userCookie);
						$scope.$parent.$emit('refreshWelcome', {});
					}
				});
			}
		},
		form: profileConfig.formConf
	};

	$scope.getProfile = function(username) {
		getSendDataFromServer(ngDataApi, {
			"method": "get",
			"routeName": "/urac/account/getUser",
			"params": {"username": username}
		}, function(error, response) {
			if(error) {
				$scope.$parent.displayAlert("danger", error.message);
			}
			else {
				$scope.userId = response._id;
				var p = JSON.stringify(response.profile, null, "\t");
				formConfig.entries = [{
					'name': 'firstName',
					'label': 'First Name',
					'type': 'text',
					'placeholder': 'Enter First Name...',
					'value': response.firstName,
					'tooltip': 'Enter the First Name of the User',
					'required': true
				},
					{
						'name': 'lastName',
						'label': 'Last Name',
						'type': 'text',
						'placeholder': 'Enter Last Name...',
						'value': response.lastName,
						'tooltip': 'Enter the Last Name of the User',
						'required': true
					},
					{
						'name': 'email',
						'label': 'Email',
						'type': 'readonly',
						'placeholder': 'Enter Email...',
						'value': response.email,
						'tooltip': 'myemail@example.domain',
						'required': true
					},
					{
						'name': 'username',
						'label': 'Username',
						'type': 'text',
						'placeholder': 'Enter Username...',
						'value': response.username,
						'tooltip': 'Usernames are alphanumeric and support _ character only',
						'required': true
					},
					{
						'name': 'profile',
						'label': 'Profile',
						'type': 'textarea',
						'value': p,
						'placeholder': 'JSON object representing your profile ...',
						'tooltip': 'Fill in your additional profile information.',
						'required': false,
						'rows': 10
					}
				];
				formConfig.data = response;
				formConfig.data.profile = p;
				// buildFormWithModal($scope, null, formConfig);
				buildForm($scope, null, formConfig);
				
				$scope.$parent.$emit('xferData', {'memberData': response});
				
			}
		});
	};

	
	if((typeof(userCookie) != "undefined") && (typeof(userCookie) == "object")) {
		var uname = userCookie.username;
		$scope.getProfile(uname);
	}
	else {
		$scope.$parent.displayAlert("danger", 'You need to Login first');
		$scope.$parent.go("/");
	}

}]);

myAccountApp.controller('registerCtrl', ['$scope', 'ngDataApi', 'isUserLoggedIn', function($scope, ngDataApi, isUserLoggedIn) {
	
	var formConfig = registerConfig.formConf;
	formConfig.actions = {
		submit: function(formData) {
			if(formData.password != formData.confirmPassword) {
				$scope.$parent.displayAlert('danger', 'Your password and confirm password fields do not match!');
				return;
			}
			var postData = {
				'username': formData.username,
				'firstName': formData.firstName,
				'lastName': formData.lastName,
				'email': formData.email,
				'password': formData.password
			};
			getSendDataFromServer(ngDataApi, {
				"method": "send",
				"routeName": "/urac/join",
				"data": postData
			}, function(error, response) {
				if(error) {
					$scope.$parent.displayAlert('danger', error.message);
				}
				else {
					$scope.$parent.displayAlert('success', 'Profile Created Successfully. We will send a link to valiadte your email address. Please check your Email');
					$scope.$parent.go("/login");
				}
			});
		}
	};
	
	if(!isUserLoggedIn()) {
		buildForm($scope, null, formConfig);
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in. Log out first');
		$scope.$parent.go("/dashboard");
	}
}]);

myAccountApp.controller('validateCtrl', ['$scope', 'ngDataApi', '$route', 'isUserLoggedIn', function($scope, ngDataApi, $route, isUserLoggedIn) {

	$scope.valiadteJoin = function() {
		getSendDataFromServer(ngDataApi, {
			"method": "get",
			"routeName": "/urac/join/validate",
			"params": {"token": $route.current.params.token}
		}, function(error, response) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.$parent.displayAlert('success', 'Your Email was Validated Successfully. You can login now');
				$scope.$parent.go("/login");
			}
		});
	};

	$scope.validateChangeEmail = function() {
		getSendDataFromServer(ngDataApi, {
			"method": "get",
			"routeName": "/urac/changeEmail/validate",
			"params": {"token": $route.current.params.token}
		}, function(error, response) {
			if(error) {
				$scope.$parent.displayAlert('danger', error.message);
			}
			else {
				$scope.$parent.displayAlert('success', 'Your email was validated and changed successfully. ');
				$scope.$parent.go("/myaccount");
			}
		});
	};

	if(!isUserLoggedIn()) {
		if($route.current.originalPath ==='/join/validate'){
			$scope.valiadteJoin();
		}
		else if($route.current.originalPath === '/changeEmail/validate'){
			$scope.validateChangeEmail();
		}
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in. Log out first');
		$scope.$parent.go("/dashboard");
	}
}]);

myAccountApp.controller('loginCtrl', ['$scope', 'ngDataApi', '$cookies', '$cookieStore', 'isUserLoggedIn', function($scope, ngDataApi, $cookies, $cookieStore, isUserLoggedIn) {
	var formConfig = loginConfig.formConf;
	formConfig.actions = {
		submit: function(formData) {
			var postData = {
				'username': formData.username, 'password': formData.password
			};
			
			getSendDataFromServer(ngDataApi, {
				"method": "send",
				"routeName": "/urac/login",
				"data": postData
			}, function(error, response) {
				if(error) {
					$scope.$parent.displayAlert('danger', error.message);
				}
				else {
					$cookieStore.put('soajs_user', response);
					$cookieStore.put("soajs_auth", response.soajsauth);
					$scope.$parent.$emit("loadUserInterface", {});
					$scope.$parent.$emit('refreshWelcome', {});
					$scope.$parent.go("/dashboard");
				}
			});
		}
	};
	
	if(!isUserLoggedIn()) {
		buildForm($scope, null, formConfig);
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in.');
		$scope.$parent.go("/dashboard");
	}
	
}]);

myAccountApp.controller('forgotPwCtrl', ['$scope', 'ngDataApi', 'isUserLoggedIn', function($scope, ngDataApi, isUserLoggedIn) {
	var formConfig = forgetPwConfig.formConf;
	formConfig.actions = {
		submit: function(formData) {
			var postData = {
				'username': formData.username, 'email': formData.email
			};
			
			getSendDataFromServer(ngDataApi, {
				"method": "get",
				"routeName": "/urac/forgotPassword",
				"params": postData
			}, function(error, response) {
				if(error) {
					$scope.$parent.displayAlert('danger', error.message);
				}
				else {
					$scope.$parent.displayAlert('success', 'An reset link has been sent to your email address.');
					$scope.$parent.go("/login");
				}
			});
		}
	};

	if(!isUserLoggedIn()) {
		buildForm($scope, null, formConfig);
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in. Log out first');
		$scope.$parent.go("/dashboard");
	}
}]);

myAccountApp.controller('setPasswordCtrl', ['$scope', 'ngDataApi', '$routeParams', 'isUserLoggedIn', function($scope, ngDataApi, $routeParams, isUserLoggedIn) {
	var formConfig = {};
	formConfig = setPasswordConfig.formConf;
	formConfig.actions = {
		submit: function(formData) {
			var postData = {
				'password': formData.password, 'confirmation': formData.confirmPassword
			};
			if(formData.password != formData.confirmPassword) {
				$scope.$parent.displayAlert('danger', 'Your password and confirm password fields do not match!');
				return;
			}
			getSendDataFromServer(ngDataApi, {
				"method": "send",
				"routeName": "/urac/resetPassword",
				"params": {"token": $routeParams.token},
				"data": postData
			}, function(error, response) {
				if(error) {
					$scope.$parent.displayAlert('danger', error.message);
				}
				else {
					$scope.$parent.displayAlert('success', 'Password was set successfully.');
					$scope.$parent.go("/login");
				}
			});
		}
	};
	if(!isUserLoggedIn()) {
		buildForm($scope, null, formConfig);
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in. Log out first');
		$scope.$parent.go("/dashboard");
	}
}]);

myAccountApp.controller('resetPwCtrl', ['$scope', 'ngDataApi', '$routeParams', 'isUserLoggedIn', function($scope, ngDataApi, $routeParams, isUserLoggedIn) {
	var formConfig = {};
	formConfig = resetPwConfig.formConf;
	formConfig.actions = {
		submit: function(formData) {
			var postData = {
				'password': formData.password, 'confirmation': formData.confirmPassword
			};
			if(formData.password != formData.confirmPassword) {
				$scope.$parent.displayAlert('danger', 'Your password and confirm password fields do not match!');
				return;
			}
			getSendDataFromServer(ngDataApi, {
				"method": "send",
				"routeName": "/urac/resetPassword",
				"params": {"token": $routeParams.token},
				"data": postData
			}, function(error, response) {
				if(error) {
					$scope.$parent.displayAlert('danger', error.message);
				}
				else {
					$scope.$parent.displayAlert('success', 'Your password was reset.');
					$scope.$parent.go("/login");
				}
			});
		}
	};
	if(!isUserLoggedIn()) {
		buildForm($scope, null, formConfig);
	}
	else {
		$scope.$parent.displayAlert('danger', 'You are already logged in. Log out first');
		$scope.$parent.go("/dashboard");
	}
}]);

