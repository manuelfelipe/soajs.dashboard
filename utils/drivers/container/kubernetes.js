"use strict";
var Kubernetes = require('node-kubernetes-client');
var utils = require("soajs/lib/utils");
var url = require('url');

function checkError(error, cb, fCb) {
	if (error) {
		return cb(error, null);
	}
	return fCb();
}

var maintenanceOperations = ["scaleUp", "scaleDown"];

var lib = {
	"getDeployer": function (deployerConfig, mongo, cb) {
		var config = utils.cloneObj(deployerConfig);
		delete config.driver;
		config.envCode = config.envCode.toUpperCase();

		var urlEndpoint = url.parse(config.endpoint);
		var k8sConn = {
			host: urlEndpoint.host,
			protocol: urlEndpoint.protocol.slice(0, -1),
			version: 'v1',
			namespace: config.namespace
		};

		if (config.token) {
			k8sConn.token = config.token;
		}else{
			k8sConn.username = config.username;
			k8sConn.password = config.password;
		}


		var k8s = new Kubernetes(k8sConn);
		// TODO: check for errors ? where are the error code numbers defined ?
		return cb(null, k8s);
	},

	"getServicePorts": function (params, mongo, cb){

		var serviceName = params.name.split("_")[0];
		var ports = [];
		var criteria = { "name": serviceName };
		console.log("mongo criteria: %j", criteria);

		mongo.findOne("services", criteria, function (error, soajsService) {
			checkError(error, cb, function () {
				if(!soajsService) {
					//NO port for service / or service not in collection ? ex: nginx. default to http(s)
					ports.push({"port": 80,  "name": "http"} );
					ports.push({"port": 443, "name": "https"} );
				}else{
					console.log("mongo found port: %j", soajsService.port);
					ports.push({"port": soajsService.port, "name": "service"} );
					ports.push({"port": soajsService.port + 1000, "name": "maintenance"} );
					console.log("mongo found something: %j", soajsService);
					console.log("found ports for service");
					console.log(ports);
				}

				return cb(null, ports);

			});
		});
	},

	"getDeploymentTemplate": function (config, params, ports, cb) {

		var name = params.name.replace(/_/g,'-'); //K8S only takes valid DNS subdomain names
		var serviceName = params.name.split("_")[0];
		var envVariables = [];
		var deploymentPorts = [];
		var replicas = 1;

		if (params.replicas) {
			console.log("Replicas set to: %v", params.replicas);
			replicas = params.replicas;
		}

		for (var i = 0, len = params.Env.length; i < len; i++) {
			var current_env = params.Env[i].split('=');
			envVariables.push({name: current_env[0], value: current_env[1]});
		}

		for (var j = 0, len = ports.length; j < len; j++) {
			deploymentPorts.push({containerPort: ports[j].port, name: ports[j].name, protocol: "TCP"});
		}

		var deploymentTemplate = {
			kind: "Deployment",
			apiVersion: "extensions/v1beta1",
			metadata: {
				name: name,
				labels: {
					env: config.envCode,
					svcname: serviceName,
					project: config.namespace //TODO, add proper labeling here
				}
			},
			spec: {
			replicas: replicas,
				template: {
					metadata: {
						labels: {
							env: config.envCode,
							svcname: serviceName,
							project: config.namespace //TODO, add proper labeling here
						}
					},
					spec: {
						containers: [ {
							name: name,
							image:  params.Image,
							command: params.Cmd,
							imagePullPolicy: "Always",
							env: envVariables,
							ports: deploymentPorts,
							livenessProbe: {
								exec: { command: ["ls", "/opt/soajs/node_modules/"] },
								initialDelaySeconds: 15,
								timeoutSeconds: 1
							},
							readinessProbe: {
								httpGet: { path: "/", port: ports[1].port},
								initialDelaySeconds: 15,
								timeoutSeconds: 3
							}
						}],
						terminationGracePeriodSeconds: 10,
						dnsPolicy: "ClusterFirst"
					}
				}
			}
		};
		console.log("deployment template: %j", deploymentTemplate);


		return cb(null, deploymentTemplate);
	},

	"getServiceTemplate": function (config, params, ports, cb) {

		var name = params.name.split("_")[0];
		var servicePorts = [];

		for (var j = 0, len = ports.length; j < len; j++) {
			servicePorts.push({targetPort: ports[j].port, port: ports[j].port, name: ports[j].name, protocol: "TCP"});
		}

		var serviceTemplate = {
			kind: "Service",
			apiVersion: "v1",
			metadata: {
				name: name,
				labels: {
					env: config.envCode,
					project: config.namespace, //TODO, add proper labeling here
					deployment: params.name.replace(/_/g,'-')
				},
			},
			spec: {
				ports: servicePorts,
				selector: {
					env: config.envCode,
					svcname: name,
					project: config.namespace //TODO, add proper labeling here
				},
				type: "ClusterIP"
			}
		};
		console.log("service template: %j", serviceTemplate);

		return cb(null, serviceTemplate);

	},

	"createIngressResource": function (config, params, deployer, mongo, cb) {

		var criteria = { "code": config.envCode.toUpperCase() };
		console.log("mongo criteria: %j", criteria);

		mongo.findOne("environment", criteria, function (error, environment) {
				checkError(error, cb, function () {

					//TODO: servicePort hardcode... does this change ?
					var template = {
						kind: "Ingress",
						apiVersion: "extensions/v1beta1",
						metadata: {
							name: "soajs-ingress-controller",
							labels: {
								env: config.envCode,
								project: config.namespace //TODO, add proper labeling here
							}
						},
						spec: {
							//tls: [ { "hosts": [ "soajsk8s-cat-api.ypcloud.io" ], "secretName": "ypcloud-io-cert" } ],
							rules: [
								{ host: environment.apiPrefix + "." + environment.domain,
									http: {
										paths: [ { "path": "/",  "backend": { "serviceName": "controller", "servicePort": 4000 }}]
									}
								}
							]
						}
					};

					console.log("Ingress template: %j", template);
					deployer.ingresses.create(template, function (err, ing) {
						checkError(err, cb, function () {
							return cb(null, ing);
						});
					});
				});
		});
	},

	"formatResource": function (res, operations, cb) {
		// massage the service object so that it conforms to the expected format
		// of lib/host.js in soajs (hardcoded to docker host model)
		res.name = res.metadata.name; //TODO: pass full service discovery name here ???
		res.Id = res.metadata.name; //TODO: pass full service discovery name here ???
		res.maintenanceOperations = maintenanceOperations;

		if(res.kind === 'Service'){
			res.NetworkSettings = { IPAddress: res.spec.clusterIP };
		}else{
			res.provider = 'scheduler';
			res.NetworkSettings = { IPAddress: "unknown" };
		}

		return cb(null, res);
	},

	"collection": function (collection, action, cid, deployerConfig, mongo, opts, cb) {
		console.log("Kubs: executing action: %s on collection: %s with Id: %j", action, collection, cid);
		lib.getDeployer(deployerConfig, mongo, function (error, deployer) {
			checkError(error, cb, function () {
				deployer[collection][action](cid, function (error, obj) {
					checkError(error, cb, function () {
						return cb(null, obj);
					});
				});
			});
	})}
};
var deployer = {


	"createContainer": function (deployerConfig, params, mongo, cb) {
		lib.getDeployer(deployerConfig, mongo, function (error, deployer) {

			if (params.customResource){
				lib["create" + params.customResource + "Resource"](deployerConfig, params, deployer, mongo, function (err, rs){
					checkError(err, cb, function () {
						lib.formatResource(rs, maintenanceOperations, cb);
					});
				});
			}else{
				lib.getServicePorts(params, mongo, function (error, ports) {
					lib.getDeploymentTemplate(deployerConfig, params, ports, function (err, deployment) {
						lib.getServiceTemplate(deployerConfig, params, ports, function (err, service) {
							deployer.deployments.create(deployment, function (err, rd) {
								checkError(err, cb, function () {
									deployer.services.create(service, function (err, srv) {
										checkError(err, cb, function () {
											lib.formatResource(srv, maintenanceOperations, cb);
										});
									});
								});
							});
						});
					});
				});
			}
		});
	},

	"start": function (deployerConfig, cid, mongo, cb) {
		lib.getDeployer(deployerConfig, mongo, function (error, deployer) {
			deployer.services.get(cid, function (err, srv) {
				lib.formatResource(srv, maintenanceOperations, cb);
			});
		});
	},

	"exec": function (deployerConfig, cid, mongo, opts, cb) {
		lib.container(deployerConfig, "exec", cid, mongo, opts, cb);
	},

	"restart": function (deployerConfig, cid, mongo, cb) {
		lib.container(deployerConfig, "restart", cid, mongo, null, cb);
	},

	"remove": function (deployerConfig, cid, mongo, cb) {
		// get service and read label matching the deployment name.
		// delete deployment
		// delete replicasets
		// delete pods
		// delete service
		lib.collection("services", "get", cid, deployerConfig, mongo, null, function (error, service) {
			lib.collection("deployments", "delete", service.metadata.labels.deployment, deployerConfig, mongo, null, function (error, dpl){
				lib.collection("replicasets", "delete", { labelSelector: 'svcname=' + cid }, deployerConfig, mongo, null, function (error, rs){
					lib.collection("pods", "delete", { labelSelector: 'svcname=' + cid }, deployerConfig, mongo, null, function (error, rs){
						lib.collection("services", "delete", cid, deployerConfig, mongo, null, cb);
					});
				});
			});
		});
	},

	"info": function (deployerConfig, cid, soajs, res, mongo) {
		// lib.getDeployer(deployerConfig, mongo, function (error, deployer) {
		// 	deployer.getContainer(cid).logs({
		// 			stderr: true,
		// 			stdout: true,
		// 			timestamps: false,
		// 			tail: 200
		// 		},
		// 		function (error, stream) {
		// 			if (error) {
		// 				soajs.log.error('logStreamContainer error: ', error);
		// 				return res.json(soajs.buildResponse({"code": 601, "msg": error.message}));
		// 			}
		// 			else {
		// 				var data = '';
		// 				var chunk;
		// 				stream.setEncoding('utf8');
		// 				stream.on('readable', function () {
		// 					var handle = this;
		// 					while ((chunk = handle.read()) != null) {
		// 						data += chunk.toString("utf8");
		// 					}
		// 				});
        //
		// 				stream.on('end', function () {
		// 					stream.destroy();
		// 					var out = soajs.buildResponse(null, {'data': data});
		// 					return res.json(out);
		// 				});
		// 			}
		// 		});
		// });
	},

	"maintenance": function (operation, deployerConfig, cid, soajs, res, mongo) {

		lib.collection("deployments", "get", { labelSelector: 'svcname=' + cid }, deployerConfig, mongo, null, function (error, dpl){
			lib.getDeployer(deployerConfig, mongo, function (error, deployer) {

				dpl = dpl[0];
				soajs.log.debug(JSON.stringify(dpl));

				if (dpl && dpl.items && dpl.items.length > 0){
					soajs.log.debug("found deployment item in kubernetes namespace. Performing '%s' operation", operation);
					var deployment = dpl.items[0];

					switch (operation) {
						case "scaleUp":
							deployment.spec.replicas = deployment.spec.replicas + 1;
							break;

						case "scaleDown":
							deployment.spec.replicas = deployment.spec.replicas - 1;
							break;

						case "status":
							var status = {'available': deployment.status.availableReplicas, 'desired': deployment.status.replicas};
							var out = soajs.buildResponse(null, {'data': status });
							soajs.log.debug("the status %j", out);
							return res.json(out);

						default:
							return res.json(soajs.buildResponse({"code": 601, "msg": error.message}));
					}

					// for now, assuming that all non-returning operations are updating the deployment object
					// works for current usage case
					deployer.deployments.update(deployment.metadata.name, deployment, function (error, dplUpdated){
						if (error){
							soajs.log.error(JSON.stringify(error));
							return res.json(soajs.buildResponse({"code": 601, "msg": error.message}));
						}else{
							soajs.log.debug("Updated spec %j", dplUpdated);
							var out = soajs.buildResponse(null, {'data': JSON.stringify(dplUpdated, null, 2)});
							return res.json(out);
						}
					});
				}
			});
		});
	}
};
module.exports = deployer;