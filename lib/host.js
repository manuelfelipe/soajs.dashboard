'use strict';
var fs = require("fs");
var async = require("async");
var request = require("request");

var deployer = require("../utils/drivers/deployer.js");

function checkIfError(soajs, res, data, cb) {
	if (data.error) {
		if (typeof (data.error) === 'object' && data.error.message) {
			soajs.log.error(data.error);
		}

		return res.jsonp(soajs.buildResponse({"code": data.code, "msg": data.config.errors[data.code]}));
	} else {
		if (cb) return cb();
	}
}

function getdeployerConfig(envRecord) {
	var deployerConfig = envRecord.deployer;
	var selectedDriver = 'docker';

	if (!deployerConfig.type || !deployerConfig.selected) {
		return null;
	}
	var driver = deployerConfig.selected.split(".");

	for (var i = 0; i < driver.length; i++) {
		deployerConfig = deployerConfig[driver[i]];
	}


	if (driver[driver.length - 1] === 'socket') {
		if (!deployerConfig.socketPath) {
			return null;
		}
	}
	else if (driver[driver.length - 1] === 'kubernetes') {
		if (!deployerConfig.endpoint){
			soajs.log.error("No endpoint defined for kubernetes platform");
			return null;
		}
		if (!deployerConfig.token && (!deployerConfig.username && !deployerConfig.password)){
			soajs.log.error("No credentials defined for kubernetes platform");
			return null;
		}
		selectedDriver = 'kubernetes';
	}
	else {
		if (!deployerConfig.host || !deployerConfig.port || !deployerConfig.config) {
			return null;
		}
		if (Object.keys(deployerConfig.config).length === 0) {
			return null;
		}
	}

	deployerConfig.driver = {
		'type': envRecord.deployer.type,
		'driver': selectedDriver
	};
	deployerConfig.selectedDriver = envRecord.deployer.selected.replace(driver[0] + '.', '').replace(/\./g, " - ");

	return deployerConfig;
}

function registerHost(soajs, res, model, config, data, deployerConfig, info, cb) {
	var document = {
		"cid": data.Id,
		"env": soajs.inputmaskData.envCode.toLowerCase(),
		"hostname": data.Name || data.name, //Config.Hostname,
		"type": info.type,
		"running": true,
		"provider": data.provider,
		"deployer": deployerConfig
	};

	model.insertContainer(soajs, document, function (error) {
		checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
			return cb();
		});
	});
}

function updateHostWithNetworkInfo(soajs, res, model, config, data, info, deployerConfig) {
	var ipValue;
	if (deployerConfig.config && deployerConfig.config.HostConfig && data.NetworkSettings && data.NetworkSettings.Networks && data.NetworkSettings.Networks[deployerConfig.config.HostConfig.NetworkMode]) {
		ipValue = data.NetworkSettings.Networks[deployerConfig.config.HostConfig.NetworkMode].IPAddress;
	} else {
		ipValue = data.NetworkSettings.IPAddress;
	}

	var newHost = {
		"version": soajs.inputmaskData.version,
		"env": soajs.inputmaskData.envCode.toLowerCase(),
		"name": info.name,
		"hostname": data.Name || data.name, //data.Config.Hostname
		"src": {
			"commit": soajs.inputmaskData.commit,
			"branch": soajs.inputmaskData.branch
		},
		"ip": ipValue
	};

	if (soajs.inputmaskData.grpConfName) {
		newHost.grpConfName = soajs.inputmaskData.grpConfName;
	}
	model.insertHost(soajs, newHost, function (error) {
		checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {

			model.getHosts(soajs, soajs.inputmaskData.envCode, "controller", function (error, controllers) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {

					model.updateContainer(soajs, data.Id, data, function (error) {
						checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {

							return res.json(soajs.buildResponse(null, {
								'cid': data.Id,
								'hostname': newHost.hostname, //data.Config.Hostname,
								"ip": ipValue,
								"controllers": controllers
							}));
						});
					});
				});
			});
		});
	});
}

function deployContainerServiceOrDaemon(config, soajs, res, model, type) {
	var context = {
		name: '',
		origin: '',
		modelMethod : (type === 'service') ? "getService": "getDaemon"
	};

	function getEnvInfo(cb){
		model.getEnvironment(soajs, soajs.inputmaskData.envCode, function (error, envRecord) {
			checkIfError(soajs, res, {config: config, error: error || !envRecord, code: 600}, function () {
				checkIfError(soajs, res, {
					config: config,
					error: envRecord.deployer.type === 'manual',
					code: 618
				}, function(){
					context.envRecord = envRecord;
					return cb();
				});
			});
		});
	}

	function getDashboardConnection(cb){
		getDashDbInfo(model, soajs, function (error, data) {
			checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
				context.mongoDbs = data.mongoDbs;
				context.mongoCred = data.mongoCred;
				context.clusterInfo = data.clusterInfo;

				context.origin = context.name = soajs.inputmaskData.name;
				if (soajs.inputmaskData.gcName && type === 'service') {
					context.name = soajs.inputmaskData.gcName;
					context.origin = "gcs";
				}
				return cb();
			});
		});
	}

	function getGitInfo(cb){
		var repoLabel = soajs.inputmaskData.owner + '/' + soajs.inputmaskData.repo;
		model.getGitAccounts(soajs, repoLabel, function (error, accountRecord) {
			checkIfError(soajs, res, {
				config: config,
				error: error || !accountRecord,
				code: 600
			}, function () {
				context.accountRecord = accountRecord;
				return cb();
			});
		});
	}

	function getServiceDaemonInfo(cb){
		model[context.modelMethod](soajs, {name: context.name}, function (error, dbRecord) {
			checkIfError(soajs, res, {
				config: config,
				error: error || !dbRecord,
				code: 600
			}, function () {
				context.dbRecord = dbRecord;
				return cb();
			});
		});
	}

	function constructDeployerParams(cb){
		var dockerParams = {
			"env": soajs.inputmaskData.envCode.toLowerCase(),
			"name": context.name,
			"image": config.images.services,
			"variables": [
				"SOAJS_SRV_AUTOREGISTERHOST=false",
				"NODE_ENV=production",
				"SOAJS_PROFILE=" + context.envRecord.profile,

				"SOAJS_MONGO_NB=" + context.mongoDbs.length,

				"SOAJS_GIT_OWNER=" + soajs.inputmaskData.owner,
				"SOAJS_GIT_REPO=" + soajs.inputmaskData.repo,
				"SOAJS_GIT_BRANCH=" + soajs.inputmaskData.branch,
				"SOAJS_GIT_COMMIT=" + soajs.inputmaskData.commit
			],
			"Cmd": [
				'bash',
				'-c',
				'cd /opt/soajs/FILES/deployer/; ./soajsDeployer.sh -T service -X deploy -G ' + context.accountRecord.provider
			]
		};

		if(type === 'daemon'){
			dockerParams['variables'].push("SOAJS_DAEMON_GRP_CONF=" + soajs.inputmaskData.grpConfName);
		}

		if(soajs.inputmaskData.replicas){
			dockerParams['replicas'] = soajs.inputmaskData.replicas;
		}

		if (context.dbRecord.src && context.dbRecord.src.cmd) {
			if (Array.isArray(context.dbRecord.src.cmd) && context.dbRecord.src.cmd.length > 0) {
				var commands = context.dbRecord.src.cmd.join("; ");
				dockerParams.Cmd[2] = commands + "; " + dockerParams.Cmd[2];
			}
		}

		if (context.dbRecord.src && context.dbRecord.src.main) {
			dockerParams.Cmd[2] = dockerParams.Cmd[2] + ' -M ' + context.dbRecord.src.main;
		}

		//adding info about database servers
		for (var i = 0; i < context.mongoDbs.length; i++) {
			dockerParams.variables.push("SOAJS_MONGO_IP_" + (i + 1) + "=" + context.mongoDbs[i].host);
			dockerParams.variables.push("SOAJS_MONGO_PORT_" + (i + 1) + "=" + context.mongoDbs[i].port);
		}

		//if mongo credentials exist, add them to env variables
		if (context.mongoCred && context.mongoCred.username && context.mongoCred.password) {
			dockerParams.variables.push("SOAJS_MONGO_USERNAME=" + context.mongoCred.username);
			dockerParams.variables.push("SOAJS_MONGO_PASSWORD=" + context.mongoCred.password);
		}

		//if replica set is used, add name to env variables
		if (context.clusterInfo.extraParam && context.clusterInfo.extraParam.replSet && context.clusterInfo.extraParam.replSet.rs_name) {
			dockerParams.variables.push("SOAJS_MONGO_RSNAME=" + context.clusterInfo.extraParam.replSet.rs_name);
		}

		//if ssl is set, add it to env variables
		if (context.clusterInfo.URLParam && context.clusterInfo.URLParam.ssl) {
			dockerParams.variables.push("SOAJS_MONGO_SSL=true");
		}

		//if private repo, add token to env variables
		if (context.accountRecord.token) {
			dockerParams.variables.push("SOAJS_GIT_TOKEN=" + context.accountRecord.token);
		}

		//if gc, add gc info to env variables
		if (soajs.inputmaskData.gcName) {
			dockerParams.variables.push("SOAJS_GC_NAME=" + soajs.inputmaskData.gcName);
			dockerParams.variables.push("SOAJS_GC_VERSION=" + soajs.inputmaskData.gcVersion);
		}

		//Add additional variables if any
		if (soajs.inputmaskData.variables && soajs.inputmaskData.variables.length > 0) {
			dockerParams.variables = dockerParams.variables.concat(soajs.inputmaskData.variables);
		}

		context.dockerParams = dockerParams;
		return cb();
	}

	function initDeployer(cb){
		var deployerConfig = getdeployerConfig(context.envRecord);
		checkIfError(soajs, res, {
			config: config,
			error: !deployerConfig,
			code: 743
		}, function () {
			context.deployerConfig = deployerConfig;
			return cb();
		});
	}

	function createContainer(cb){
		soajs.log.debug("Calling create container with params:", JSON.stringify(context.deployerConfig), JSON.stringify(context.dockerParams));
		deployer.createContainer(context.deployerConfig, context.dockerParams, model.getDB(), function (error, data) {
			checkIfError(soajs, res, {
				config: config,
				error: error,
				code: (error && error.code === 741) ? error.code : 615
			}, function () {
				soajs.log.debug("Returned data: ", JSON.stringify(data));
				context.data = data;
				return cb();
			});
		});
	}

	function registerHostInfo(cb){
		soajs.log.debug("Container Created, starting container with params:", JSON.stringify(context.deployerConfig), JSON.stringify(context.data));
		context.info = {
			type: type,
			name: context.name
		};
		context.data.provider = context.accountRecord.provider;
		registerHost(soajs, res, model, config, context.data, context.deployerConfig, context.info, cb);
	}

	function startContainer(cb){
		deployer.start(context.deployerConfig, context.data.Id, model.getDB(), function (error, data) {
			checkIfError(soajs, res, {
				config: config,
				error: error,
				code: 615
			}, function () {
				context.data = data;
				soajs.log.debug("Container started, saving information in core_provision", JSON.stringify(context.data));
				return cb();
			});
		});
	}

	function updateHost(){
		updateHostWithNetworkInfo(soajs, res, model, config, context.data, context.info, context.deployerConfig);
	}

	getEnvInfo(function(){
		getDashboardConnection(function(){
			getGitInfo(function(){
				getServiceDaemonInfo(function(){
					constructDeployerParams(function(){
						initDeployer(function(){
							createContainer(function(){
								registerHostInfo(function(){
									startContainer(function(){
										updateHost();
									});
								});
							});
						});
					});
				});
			});
		});
	});
}

function getDashDbInfo(model, soajs, cb) {
	model.getDashboardEnvironment(soajs, function (error, envRecord) {
		if (error) {
			return cb(error);
		}

		var clusterName = envRecord.dbs.config.session.cluster;
		var data = {
			mongoDbs: envRecord.dbs.clusters[clusterName].servers,
			mongoCred: envRecord.dbs.clusters[clusterName].credentials,
			clusterInfo: envRecord.dbs.clusters[clusterName]
		};
		return cb(null, data);
	});
}

var BL = {
	model: null,

	"nginx": function(config, soajs, deployNewNginx, res){
		/*
		 1- get environment information
		 2- get running controllers
		 3- get nginx containers
		    3.1- if nginx > 0
		        3.1.1- get oneNginx container
		            3.1.1.1 - if new
		                 3.1.1.1.1- initialize deployer
						 3.1.1.1.2- construct deployer params
						 3.1.1.1.3- deploy nginx container
						 3.1.1.1.4- insert nginx container information
		            3.1.1.2 - if old
						 3.1.1.2.1- construct deployer params
						 3.1.1.2.2- exec nginx container
						 3.1.1.2.3- update nginx container information
	        3.2- if nginx === 0
		        3.2.1- get ui information
		        3.2.2- initialize deployer
		        3.2.3- construct deployer params
		        3.2.4- deploy nginx container
		        3.2.5- insert nginx container information
		 */
		var context = {};
		function getEnvInfo(cb){
			//from envCode, load env, get port and domain
			BL.model.getEnvironment(soajs, soajs.inputmaskData.envCode, function (err, envRecord) {
				checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 600}, function () {
					checkIfError(soajs, res, {
						config: config,
						error: !envRecord.deployer.type || !envRecord.deployer.selected,
						code: 743
					}, function () {
						context.envRecord = envRecord;
						return cb();
					});
				});
			});
		}

		function getRunningControllers(cb){
			BL.model.getContainers(soajs, context.envRecord.code, "controller", true, function (error, controllers) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {

					//no controllers found, no need to proceed
					if (!controllers || (controllers && controllers.length === 0)) {
						soajs.log.debug("No controllers found for environment: " + context.envRecord.code + ". No need to proceed.");
						return res.json(soajs.buildResponse(null, true));
					}
					else {
						BL.model.getHosts(soajs, context.envRecord.code, "controller", function (error, hostsData) {
							checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {

								controllers.forEach(function (oneController) {
									hostsData.forEach(function (oneHostData) {
										if (oneController.hostname === oneHostData.hostname) {
											oneController.ip = oneHostData.ip;
										}
									});
								});
								context.controllers = controllers;
								return cb();
							});
						});
					}
				});
			});
		}

		function getRunningNginxContainers(cb){
			BL.model.getContainers(soajs, context.envRecord.code, "nginx", true, function (error, nginxes) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
					if (nginxes && nginxes.length > 0) {
						context.nginxes = nginxes;
					}

					return cb();
				});
			});
		}

		function getCustomUIConfig(cb){
			if (soajs.inputmaskData.nginxConfig && soajs.inputmaskData.nginxConfig.customUIId) {
				var id = soajs.inputmaskData.nginxConfig.customUIId;
				try {
					id = BL.model.makeObjectId(id);
				} catch (e) {
					return cb(e);
				}

				BL.model.getStaticContent(soajs, id, function (error, srcRecord) {
					if (error) {
						return cb(error);
					}

					if (srcRecord) {
						var repoLabel = srcRecord.src.owner + '/' + srcRecord.src.repo;
						BL.model.getGitAccounts(soajs, repoLabel, function (error, tokenRecord) {
							if (error || !tokenRecord) {
								return cb(error || !tokenRecord);
							}
							if (tokenRecord.token) {
								srcRecord.token = tokenRecord.token;
							}

							cb(null, srcRecord);
						});
					}
					else {
						return cb();
					}
				});
			} else {
				cb(null, null);
			}
		}

		function initializeDeployer(cb){
			context.deployerConfig = getdeployerConfig(context.envRecord);
			checkIfError(soajs, res, {
				config: config,
				error: !context.deployerConfig,
				code: 743
			}, function () {
				return cb();
			});
		}

		function constructDeployerParams(customData, oldVariables){
			if(oldVariables && oldVariables.length > 0){
				for(var i = oldVariables.length -1; i >= 0; i--){
					if(oldVariables[i].indexOf("SOAJS_NX_CONTROLLER_NB") !== -1){
						oldVariables.splice(i, 1);
					}
					else if(oldVariables[i].indexOf("SOAJS_NX_CONTROLLER_IP_") !== -1){
						oldVariables.splice(i, 1);
					}
				}
			}

			var dockerParams = {
				"env": context.envRecord.code.toLowerCase(),
				"name": "nginxapi",
				"image": config.images.nginx,
				"variables": oldVariables,
				"Cmd": [
					'bash',
					'-c',
					'./soajsDeployer.sh -T nginx -X'
				]
			};

			dockerParams.Cmd[2] += (deployNewNginx) ? ' deploy' : ' redeploy -c';

			dockerParams.variables.push("SOAJS_NX_CONTROLLER_NB=" + context.controllers.length);
			for (var i = 0; i < context.controllers.length; i++) {
				dockerParams.variables.push("SOAJS_NX_CONTROLLER_IP_" + (i + 1) + "=" + context.controllers[i].ip);
			}

			dockerParams.variables.push("SOAJS_NX_SITE_DOMAIN=" + context.envRecord.sitePrefix + "." + context.envRecord.domain);
			dockerParams.variables.push("SOAJS_NX_API_DOMAIN=" + context.envRecord.apiPrefix + "." + context.envRecord.domain);

			if (customData) {
				dockerParams.variables.push("SOAJS_GIT_REPO=" + customData.src.repo);
				dockerParams.variables.push("SOAJS_GIT_OWNER=" + customData.src.owner);
				dockerParams.variables.push("SOAJS_GIT_BRANCH=" + soajs.inputmaskData.nginxConfig.branch);
				dockerParams.variables.push("SOAJS_GIT_COMMIT=" + soajs.inputmaskData.nginxConfig.commit);
				if (customData.token) {
					dockerParams.variables.push("SOAJS_GIT_TOKEN=" + customData.token);
				}
			}

			if(!deployNewNginx){
				if (Array.isArray(dockerParams.variables) && dockerParams.variables.length > 0) {
					var commands = [];
					dockerParams.variables.forEach(function(oneVariable){
						commands.push('export ' + oneVariable + " && ");
					});
					dockerParams.Cmd[2] = commands.join("") + dockerParams.Cmd[2];
				}
			}
			else{
				if(soajs.inputmaskData.exposedPort){
					dockerParams.exposedPort = soajs.inputmaskData.exposedPort;
				}

			}

			//trying not to change much the logic from the controllers side.
			//sending all the docker data but not actually used by scheduler driver
			if (context.envRecord.deployer.selected.split('.')[1] === 'scheduler') {
				dockerParams.customResource = 'Ingress';
			}

			dockerParams.Cmd[2] = "cd /opt/soajs/FILES/deployer/; " + dockerParams.Cmd[2];
			// console.log("====================================");
			// console.log(JSON.stringify(dockerParams, null, 2));
			// console.log("====================================");
			return dockerParams;
		}

		function deployContainerAndInsert(cb){
			soajs.log.debug("Creating container with params:", JSON.stringify(context.deployerConfig), JSON.stringify(context.dockerParams));
			deployer.createContainer(context.deployerConfig, context.dockerParams, BL.model.getDB(), function (error, data) {
				checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {

					// if scheduler, no need to start
					if (context.envRecord.deployer.selected.split('.')[1] !== 'scheduler') {
						soajs.log.debug("Starting container with params:", JSON.stringify(context.deployerConfig), JSON.stringify(data));
						deployer.start(context.deployerConfig, data.Id, BL.model.getDB(), function (error, data) {
							checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {

								soajs.log.debug("Saving container information in docker collection.");
								var document = {
									"env": context.envRecord.code.toLowerCase(),
									"cid": data.Id,
									"hostname": "nginx_" + context.envRecord.code.toLowerCase(),
									"type": "nginx",
									"running": true,
									"deployer": context.deployerConfig,
									"info": data
								};
								BL.model.insertContainer(soajs, document, function (error) {
									checkIfError(soajs, res, {
										config: config,
										error: error,
										code: 615
									}, function () {
										return cb();
									});
								});
							});
						});
					}else{
						soajs.log.debug("Saving container information in docker collection.");
						var document = {
							"env": context.envRecord.code.toLowerCase(),
							"cid": data.Id,
							"hostname": "nginx_" + context.envRecord.code.toLowerCase(),
							"type": "nginx",
							"running": true,
							"deployer": context.deployerConfig,
							"info": data
						};

						if(data.provider) {
							document.provider = data.provider;
						}

						BL.model.insertContainer(soajs, document, function (error) {
							checkIfError(soajs, res, {
								config: config,
								error: error,
								code: 615
							}, function () {
								return cb();
							});
						});
					}
				});
			});
		}

		function execContainerAndUpdate(containerRecord, dockerParams, cb){
			soajs.log.debug("Updating container with params:", JSON.stringify(containerRecord.deployer), JSON.stringify(dockerParams));
			deployer.exec(containerRecord.deployer, containerRecord.cid, BL.model.getDB(), dockerParams, function (error, exec) {
				checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
					exec.start({}, function(err){
						checkIfError(soajs, res, {config: config, error: err, code: 615}, function () {
							var newParams = containerRecord;
							newParams.info.Config.Env = dockerParams.variables;
							BL.model.updateContainer(soajs, containerRecord.cid, newParams.info, function (error) {
								checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
									return cb();
								});
							});
						});
					});
				});
			});
		}

		getEnvInfo(function(){
			getRunningControllers(function(){
				getRunningNginxContainers(function(){
					if(context.nginxes){
						if(deployNewNginx){
							initializeDeployer(function(){
								context.dockerParams = constructDeployerParams(null, context.nginxes[0].info.Config.Env);
								deployContainerAndInsert(function(){
									return res.json(soajs.buildResponse(null, true));
								});
							});
						}
						else{
							async.each(context.nginxes, function(oneNginxContainerRecord, cb){
								var dockerParams = constructDeployerParams(null, oneNginxContainerRecord.info.Config.Env);
								execContainerAndUpdate(oneNginxContainerRecord, dockerParams, cb);

							}, function(){
								return res.json(soajs.buildResponse(null, true));
							});
						}
					}
					else{
						getCustomUIConfig(function(error, customData){
							initializeDeployer(function(){
								context.dockerParams = constructDeployerParams(customData, []);
								deployContainerAndInsert(function(){
									return res.json(soajs.buildResponse(null, true));
								});
							});
						});
					}
				});
			});
		});
	},

	"deployController": function (config, soajs, res) {
		var context = {};
		function checkifDashboardEnvironment(cb){
			checkIfError(soajs, res, {
				config: config,
				error: soajs.inputmaskData.envCode.toLowerCase() === 'dashboard',
				code: 750
			}, cb);
		}

		function getEnvInfo(cb){
			BL.model.getEnvironment(soajs, soajs.inputmaskData.envCode, function (err, envRecord) {
				checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 600}, function () {
						checkIfError(soajs, res, {
							config: config,
							error: envRecord.deployer.type === 'manual',
							code: 618
						}, function () {
							context.envRecord = envRecord;
							return cb();
						});
				});
			});
		}

		function getDashboardConnection(cb){
			getDashDbInfo(BL.model, soajs, function (error, data) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
					context.mongoDbs = data.mongoDbs;
					context.mongoCred = data.mongoCred;
					context.clusterInfo = data.clusterInfo;
					return cb();
				});
			});
		}

		function getGitInfo(cb){
			var repoLabel = soajs.inputmaskData.owner + '/' + soajs.inputmaskData.repo;
			BL.model.getGitAccounts(soajs, repoLabel, function (error, accountRecord) {
				checkIfError(soajs, res, {
					config: config,
					error: error || !accountRecord,
					code: 600
				}, function () {
					context.accountRecord = accountRecord;
					return cb();
				});
			});
		}

		function getControllerInfo(cb){
			BL.model.getService(soajs, {name: 'controller'}, function (error, dbRecord) {
				checkIfError(soajs, res, {
					config: config,
					error: error || !dbRecord,
					code: 600
				}, function () {
					context.dbRecord = dbRecord;
					return cb();
				});
			});
		}

		function constructDeployerParams(cb){
			var dockerParams = {
				"image": config.images.services,
				"name": "controller",
				"env": soajs.inputmaskData.envCode.toLowerCase(),
				"variables": [
					"SOAJS_SRV_AUTOREGISTERHOST=false",
					"NODE_ENV=production",
					"SOAJS_PROFILE=" + context.envRecord.profile,
					"SOAJS_MONGO_NB=" + context.mongoDbs.length,

					"SOAJS_GIT_OWNER=" + soajs.inputmaskData.owner,
					"SOAJS_GIT_REPO=" + soajs.inputmaskData.repo,
					"SOAJS_GIT_BRANCH=" + soajs.inputmaskData.branch,
					"SOAJS_GIT_COMMIT=" + soajs.inputmaskData.commit
				],
				"Cmd": [
					'bash',
					'-c',
					'cd /opt/soajs/FILES/deployer/; ./soajsDeployer.sh -T service -X deploy -G ' + context.accountRecord.provider
				]
			};

			if (context.dbRecord.src && context.dbRecord.src.cmd) {
				if (Array.isArray(context.dbRecord.src.cmd) && context.dbRecord.src.cmd.length > 0) {
					var commands = context.dbRecord.src.cmd.join("; ");
					dockerParams.Cmd[2] = commands + "; " + dockerParams.Cmd[2];
				}
			}

			if (context.dbRecord.src && context.dbRecord.src.main) {
				dockerParams.Cmd[2] = dockerParams.Cmd[2] + ' -M ' + context.dbRecord.src.main;
			}

			//adding info about database servers
			for (var i = 0; i < context.mongoDbs.length; i++) {
				dockerParams.variables.push("SOAJS_MONGO_IP_" + (i + 1) + "=" + context.mongoDbs[i].host);
				dockerParams.variables.push("SOAJS_MONGO_PORT_" + (i + 1) + "=" + context.mongoDbs[i].port);
			}

			//if mongo credentials exist, add them to env variables
			if (context.mongoCred && context.mongoCred.username && context.mongoCred.password) {
				dockerParams.variables.push("SOAJS_MONGO_USERNAME=" + context.mongoCred.username);
				dockerParams.variables.push("SOAJS_MONGO_PASSWORD=" + context.mongoCred.password);
			}

			//if replica set is used, add name to env variables
			if (context.clusterInfo.extraParam && context.clusterInfo.extraParam.replSet && context.clusterInfo.extraParam.replSet.rs_name) {
				dockerParams.variables.push("SOAJS_MONGO_RSNAME=" + context.clusterInfo.extraParam.replSet.rs_name);
			}

			//if ssl is set, add it to env variables
			if (context.clusterInfo.URLParam && context.clusterInfo.URLParam.ssl) {
				dockerParams.variables.push("SOAJS_MONGO_SSL=true");
			}

			//if private repo, add token to env variables
			if (context.accountRecord.token) {
				dockerParams.variables.push("SOAJS_GIT_TOKEN=" + context.accountRecord.token);
			}

			//Add additional variables if any
			if (soajs.inputmaskData.variables && soajs.inputmaskData.variables.length > 0) {
				dockerParams.variables = dockerParams.variables.concat(soajs.inputmaskData.variables);
			}

			context.dockerParams = dockerParams;
			return cb();
		}

		checkifDashboardEnvironment(function(){
			getEnvInfo(function(){
				getDashboardConnection(function(){
					getGitInfo(function(){
						getControllerInfo(function(){
							constructDeployerParams(function(){
								deployControllers(0, soajs.inputmaskData.number, context.envRecord, context.dockerParams, function () {
									return res.json(soajs.buildResponse(null, true));
								});
							});
						});
					});
				});
			});
		});

		function deployControllers(counter, max, envRecord, dockerParams, cb) {
			var deployerConfig = getdeployerConfig(envRecord);
			checkIfError(soajs, res, {
				config: config,
				error: !deployerConfig,
				code: 743
			}, function () {
				soajs.log.debug("Calling create container:", JSON.stringify(deployerConfig), JSON.stringify(dockerParams));
				deployer.createContainer(deployerConfig, dockerParams, BL.model.getDB(), function (error, data) {
					checkIfError(soajs, res, {
						config: config,
						error: error,
						code: (error && error.code === 741) ? error.code : 615
					}, function () {
						soajs.log.debug("Container Created, starting container:", JSON.stringify(deployerConfig), JSON.stringify(data));
						deployer.start(deployerConfig, data.Id, BL.model.getDB(), function (error, data) {
							checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
								registerNewControllerHost(data, deployerConfig, function () {
									counter++;

									// checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
									soajs.log.debug("Container started, saving information in core_provision", JSON.stringify(data));
									updateControllerHostWithNetworkInfo(data, deployerConfig, function () {
										if (counter === max) {
											return cb();
										}
										else {
											deployControllers(counter, max, envRecord, dockerParams, cb);
										}
									});
								});
							});
						});
					});
				});
			});
		}

		function registerNewControllerHost(data, deployerConfig, cb) {
			//get the ip of the host from hosts
			//insert into docker collection
			var document = {
				"cid": data.Id,
				"env": soajs.inputmaskData.envCode.toLowerCase(),
				"hostname": data.Name || data.name, //data.Config.Hostname,
				"running": true,
				"type": "controller",
				"provider": context.accountRecord.provider,
				"deployer": deployerConfig,
				"info": data
			};
			BL.model.insertContainer(soajs, document, function (error) {
				checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
					return cb();
				});
			});
		}

		function updateControllerHostWithNetworkInfo(data, deployerConfig, cb) {
			var ipValue;
			if (deployerConfig.config && deployerConfig.config.HostConfig && data.NetworkSettings && data.NetworkSettings.Networks && data.NetworkSettings.Networks[deployerConfig.config.HostConfig.NetworkMode]) {
				ipValue = data.NetworkSettings.Networks[deployerConfig.config.HostConfig.NetworkMode].IPAddress;
			} else {
				ipValue = data.NetworkSettings.IPAddress;
			}

			var newHost = {
				"version": soajs.inputmaskData.version,
				"env": soajs.inputmaskData.envCode.toLowerCase(),
				"name": "controller",
				"hostname": data.Name || data.name, //data.Config.Hostname
				"src": {
					"commit": soajs.inputmaskData.commit,
					"branch": soajs.inputmaskData.branch
				},
				"ip": ipValue
			};

			BL.model.insertHost(soajs, newHost, function (error) {
				checkIfError(soajs, res, {config: config, error: error, code: 615}, function () {
					return cb(null, true);
				});
			});
		}
	},

	"deployService": function (config, soajs, res) {
		deployContainerServiceOrDaemon(config, soajs, res, BL.model, 'service');
	},

	"deployDaemon": function (config, soajs, res) {
		deployContainerServiceOrDaemon(config, soajs, res, BL.model, 'daemon');
	},

	"list": function (config, soajs, res) {
		BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (err, envRecord) {
			checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 600}, function () {

				BL.model.getHosts(soajs, envRecord.code, null, function (err, hosts) {
					checkIfError(soajs, res, {config: config, error: err, code: 600}, function () {

						BL.model.getContainers(soajs, envRecord.code, null, null, function (err, containers) {
							checkIfError(soajs, res, {config: config, error: err, code: 600}, function () {

								hosts.forEach(function (oneHost) {
									containers.forEach(function (oneContainer) {
										if (oneHost.hostname === oneContainer.hostname) {
											oneHost.cid = oneContainer.cid;
											if (oneContainer.info && oneContainer.info.maintenanceOperations) {
												oneHost.maintenanceOperations = oneContainer.info.maintenanceOperations;
											}
										}
									});
								});
								return res.jsonp(soajs.buildResponse(null, {
									'hosts': hosts,
									'deployer': envRecord.deployer,
									'profile': envRecord.profile
								}));
							});
						});
					});
				});
			});
		});
	},

	"listNginx": function (config, soajs, res) {
		BL.model.getContainers(soajs, soajs.inputmaskData.env, 'nginx', true, function (error, records) {
			checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
				return res.jsonp(soajs.buildResponse(null, records));
			});
		});
	},

	"delete": function (config, soajs, res) {

		var rebuildNginx = false;
		BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (err, envRecord) {
			checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 600}, function () {
				if (envRecord.deployer.type === 'manual') {
					removeHost(envRecord.code, envRecord.deployer.type, null);
				}
				else {
					BL.model.getOneContainer(soajs, envRecord.code, soajs.inputmaskData.hostname, function (error, dockerRecord) {
						checkIfError(soajs, res, {
							config: config,
							error: error || !dockerRecord,
							code: 600
						}, function () {
							if (dockerRecord.type === 'controller') {
								rebuildNginx = true;
							}

							removeHost(envRecord.code, envRecord.deployer.type, dockerRecord);
						});
					});
				}
			});
		});

		function removeHost(env, deployerType, dockerRecord) {
			BL.model.removeHost(soajs, env, soajs.inputmaskData.name, soajs.inputmaskData.ip, function (error) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
					if (deployerType === 'container') {
						removeDockerContainer(env, dockerRecord);
					}
					else {
						return res.jsonp(soajs.buildResponse(null, true));
					}
				});
			});
		}

		function removeDockerContainer(env, dockerRecord) {
			deployer.remove(dockerRecord.deployer, dockerRecord.cid, BL.model.getDB(), function (error) {
				checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {

					BL.model.removeContainer(soajs, env, dockerRecord.hostname, function (err) {
						checkIfError(soajs, res, {config: config, error: err, code: 600}, function () {

							if (rebuildNginx) {
								soajs.log.debug("Deleted controller container, rebuilding Nginx ....");
								soajs.inputmaskData.envCode = env.toUpperCase();
								BL.nginx(config, soajs, false, res);
							}
							else {
								return res.jsonp(soajs.buildResponse(null, true));
							}
						});
					});
				});
			});
		}
	},

	"maintenanceOperation": function (config, soajs, res) {
		soajs.inputmaskData.env = soajs.inputmaskData.env.toLowerCase();
		checkIfError(soajs, res, {
			config: config,
			error: soajs.inputmaskData.operation === 'awarenessStat' && soajs.inputmaskData.serviceName !== 'controller',
			code: 602
		}, function () {
			checkIfError(soajs, res, {
				config: config,
				error: soajs.inputmaskData.operation === 'loadProvision' && soajs.inputmaskData.serviceName === 'controller',
				code: 602
			}, function () {
				//check that the given service has the given port in services collection
				if (soajs.inputmaskData.serviceName === 'controller') {
					checkServiceHost();
				}
				else {
					BL.model.getService(soajs, {
						'name': soajs.inputmaskData.serviceName,
						'port': soajs.inputmaskData.servicePort
					}, function (error, record) {
						checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
							if (!record) {
								BL.model.getDaemon(soajs, {
									'name': soajs.inputmaskData.serviceName,
									'port': soajs.inputmaskData.servicePort
								}, function (error, record) {
									checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
										checkIfError(soajs, res, {
											config: config,
											error: !record,
											code: 604
										}, function () {
											checkServiceHost();
										});
									});
								});
							}
							else {
								//check that the given service has the given host in hosts collection
								checkServiceHost();
							}
						});
					});
				}
			});
		});

		function checkServiceHost() {
			BL.model.getOneHost(soajs, soajs.inputmaskData.env, soajs.inputmaskData.serviceName, soajs.inputmaskData.ip, soajs.inputmaskData.hostname, function (error, record) {
				checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
					checkIfError(soajs, res, {config: config, error: !record, code: 605}, function () {
						//perform maintenance operation
						doMaintenance(record);
					});
				});
			});
		}

		function doMaintenance(oneHost) {
			BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (err, envRecord) {
				checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 600}, function () {
					if (!envRecord.deployer) {
						soajs.log.error('Missing deployer obj');
					}
					checkIfError(soajs, res, {
						config: config,
						error: soajs.inputmaskData.operation === 'hostLogs' && envRecord.deployer.type === 'manual',
						code: 619
					}, function () {
						switch (soajs.inputmaskData.operation) {
							case 'hostLogs':
								BL.model.getOneContainer(soajs, envRecord.code, soajs.inputmaskData.hostname, function (error, response) {
									checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
										var deployerConfig;
										if (response) {
											deployerConfig = response.deployer;
											deployer.info(deployerConfig, response.cid, soajs, res, BL.model.getDB());
										}
										else {
											soajs.log.error('No response obj');
											checkIfError(soajs, res, {
												config: config,
												error: true,
												code: 603
											}, function () {
											});
										}
									});
								});
								break;
							case 'extended':
								BL.model.getOneContainer(soajs, envRecord.code, soajs.inputmaskData.hostname, function (error, response) {
									checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
										var deployerConfig;
										if (response) {
											deployerConfig = response.deployer;
											deployer.maintenance(soajs.inputmaskData.extendedOperation, deployerConfig, response.cid, soajs, res, BL.model.getDB());
										}
										else {
											soajs.log.error('No response obj');
											checkIfError(soajs, res, {
												config: config,
												error: true,
												code: 603
											}, function () {
											});
										}
									});
								});
								break;
							default:
								soajs.inputmaskData.servicePort = soajs.inputmaskData.servicePort + 1000;
								var maintenanceURL = "http://" + oneHost.ip + ":" + soajs.inputmaskData.servicePort;
								maintenanceURL += "/" + soajs.inputmaskData.operation;
								soajs.log.debug("calling maintenance url: %s", maintenanceURL);
								request.get(maintenanceURL, function (error, response, body) {
									checkIfError(soajs, res, {config: config, error: error, code: 603}, function () {
										return res.jsonp(soajs.buildResponse(null, JSON.parse(body)));
									});
								});
								break;
						}
					});
				});
			});
		}
	},

	"getContainerLogs": function (config, soajs, res) {
		BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (error, envRecord) {
			checkIfError(soajs, res, {config: config, error: error || !envRecord, code: 600}, function () {
				checkIfError(soajs, res, {
					config: config,
					error: envRecord.deployer.type === 'manual',
					code: 619
				}, function () {

					BL.model.getOneContainer(soajs, envRecord.code, soajs.inputmaskData.cid, function (error, record) {
						checkIfError(soajs, res, {config: config, error: error || !record, code: 600}, function () {

							deployer.info(record.deployer, record.cid, soajs, res, BL.model.getDB());
						});
					});
				});
			});
		});
	},

	"deleteContainer": function (config, soajs, res) {
		//should be used in case container has no host record such as nginx containers and zombie containers
		BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (error, envRecord) {
			checkIfError(soajs, res, {config: config, error: error || !envRecord, code: 773}, function () {
				checkIfError(soajs, res, {
					config: config,
					error: envRecord.deployer.type === 'manual',
					code: 619
				}, function () {

					BL.model.getOneContainer(soajs, envRecord.code, soajs.inputmaskData.cid, function (error, dockerRecord) {
						checkIfError(soajs, res, {config: config, error: error || !dockerRecord, code: 773}, function () {
								removeDockerContainer(dockerRecord, envRecord.code);
						});
					});
				});
			});
		});

		function removeDockerContainer(dockerRecord, env) {
			deployer.remove(dockerRecord.deployer, dockerRecord.cid, BL.model.getDB(), function (error) {
				if (error) {
					soajs.log.error(error);
				}
				else {
					soajs.log.debug("Container has been deleted from " + soajs.inputmaskData.env + " environment");
				}

				BL.model.removeContainer(soajs, env, soajs.inputmaskData.cid, function (error) {
					checkIfError(soajs, res, {config: config, error: error, code: 600}, function () {
						soajs.log.debug("Container has been removed from docker collection");

						return res.jsonp(soajs.buildResponse(null, true));
					});
				});
			});
		}
	},

	"getContainersNoHost": function (config, soajs, res) {

		BL.model.getEnvironment(soajs, soajs.inputmaskData.env, function (err, envRecord) {
			checkIfError(soajs, res, {config: config, error: err || !envRecord, code: 772}, function () {

				if (envRecord.deployer.type === 'manual') {
					return res.json(soajs.buildResponse(null, []));
				}

				BL.model.getContainers(soajs, envRecord.code, {"$ne": "nginx"}, null, function (error, containers) {
					checkIfError(soajs, res, {config: config, error: error, code: 772}, function () {

						BL.model.getHosts(soajs, envRecord.code, null, function (error, hosts) {
							checkIfError(soajs, res, {config: config, error: error, code: 772}, function () {

								for (var i = containers.length - 1; i >= 0; i--) {
									var found = false;
									hosts.forEach(function (oneHost) {
										if (containers[i].hostname === oneHost.hostname) {
											found = true;
										}
									});
									//only keep containers that have no host
									if (found) {
										containers.splice(i, 1);
									}
								}

								return res.json(soajs.buildResponse(null, containers));
							});
						});
					});
				});
			});
		});
	}
};

module.exports = {
	"init": function (modelName, cb) {
		var modelPath;

		if (!modelName) {
			return cb(new Error("No Model Requested!"));
		}

		modelPath = __dirname + "/../models/" + modelName + ".js";
		return requireModel(modelPath, cb);

		/**
		 * checks if model file exists, requires it and returns it.
		 * @param filePath
		 * @param cb
		 */
		function requireModel(filePath, cb) {
			//check if file exist. if not return error
			fs.exists(filePath, function (exists) {
				if (!exists) {
					return cb(new Error("Requested Model Not Found!"));
				}

				BL.model = require(filePath);
				return cb(null, BL);
			});
		}
	}
};
