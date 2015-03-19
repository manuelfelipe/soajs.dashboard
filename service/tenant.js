'use strict';
var colName = "tenants";
var prodColName = "products";
var envColName = "environment";

function validateId(mongo, req, cb) {
	try {
		req.soajs.inputmaskData.id = mongo.ObjectId(req.soajs.inputmaskData.id);
		return cb(null);
	} catch(e) {
		return cb(e);
	}
}

function checkifProductAndPackageExist(productCode, packageCode, mongo, cb) {
	mongo.findOne(prodColName, {'code': productCode}, function(error, productRecord) {
		if(error) { return cb(error); }
		if(!productRecord) { return cb(null, false); }

		for(var i = 0; i < productRecord.packages.length; i++) {
			if(productRecord.packages[i].code === productCode + '_' + packageCode) {
				return cb(null, {'product': productRecord, 'package': productRecord.packages[i]});
			}
		}
		return cb(null, false);
	});
}

function checkIfEnvironmentExists(mongo, envCode, cb) {
	mongo.findOne(envColName, {'code': envCode}, function(error, envRecord) {
		if(error) { return cb(error); }

		if(!envRecord) { return cb(null, false); }

		return cb(null, true);
	});
}

function getRequestedSubElementsPositions(tenantRecord, req) {
	var found = false;
	var position = [];

	//find the application
	for(var i = 0; i < tenantRecord.applications.length; i++) {
		if(tenantRecord.applications[i].appId.toString() === req.soajs.inputmaskData.appId) {
			position.push(i); //application position found

			//if key is requested, go one level deeper
			if(req.soajs.inputmaskData.key) {

				//find the key
				for(var j = 0; j < tenantRecord.applications[i].keys.length; j++) {
					if(tenantRecord.applications[i].keys[j].key === req.soajs.inputmaskData.key) {
						position.push(j); //application key position found

						//if extKey is requested, go one level deeper
						if(req.soajs.inputmaskData.extKey) {
							//find the ext key
							for(var k = 0; k < tenantRecord.applications[i].keys[j].extKeys.length; k++) {
								if(tenantRecord.applications[i].keys[j].extKeys[k].extKey === req.soajs.inputmaskData.extKey) {
									position.push(k); //application extKey found

									//no need to go further, simply return
									found = true;
									break;
								}
							}
						}
						//else return what is found
						else {
							found = true;
							break;
						}
					}
				}
			}
			//else return what is found
			else {
				found = true;
				break;
			}
		}
	}
	return {'found': found, 'position': position};
}

function saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, code, msg) {
	mongo.save(colName, tenantRecord, function(error) {
		if(error) { return res.jsonp(req.soajs.buildResponse({"code": code, "msg": config.errors[code]})); }

		return res.jsonp(req.soajs.buildResponse(null, msg));
	});
}

module.exports = {
	"delete": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.remove(colName, {"_id": req.soajs.inputmaskData.id}, function(error) {
				if(error) { return res.jsonp(req.soajs.buildResponse({"code": 424, "msg": config.errors[424]})); }
				return res.jsonp(req.soajs.buildResponse(null, "tenant delete successful"));
			});
		});
	},

	"list": function(config, mongo, req, res) {
		mongo.find(colName, function(err, records) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 422, "msg": config.errors[422]})); }
			return res.jsonp(req.soajs.buildResponse(null, records));
		});
	},

	"add": function(config, mongo, req, res) {
		req.soajs.inputmaskData.code = req.soajs.inputmaskData.code.toUpperCase();
		var record = {
			"code": req.soajs.inputmaskData.code,
			"name": req.soajs.inputmaskData.name,
			"description": req.soajs.inputmaskData.description,
			"oauth": {},
			"applications": []
		};

		mongo.count(colName, {'code': record.code}, function(error, count) {
			if(error) { return res.jsonp(req.soajs.buildResponse({"code": 420, "msg": config.errors[420]})); }

			if(count > 0) { return res.jsonp(req.soajs.buildResponse({"code": 423, "msg": config.errors[423]})); }

			mongo.insert(colName, record, function(err) {
				if(err) { return res.jsonp(req.soajs.buildResponse({"code": 420, "msg": config.errors[420]})); }
				return res.jsonp(req.soajs.buildResponse(null, "tenant add successful"));
			});
		});
	},

	"update": function(config, mongo, req, res) {
		var s = {
			'$set': {
				'description': req.soajs.inputmaskData.description,
				'name': req.soajs.inputmaskData.name
			}
		};
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.update(colName, {"_id": req.soajs.inputmaskData.id}, s, {'upsert': false, 'safe': true}, function(err, data) {
				if(err) { return res.jsonp(req.soajs.buildResponse({"code": 421, "msg": config.errors[421]})); }
				return res.jsonp(req.soajs.buildResponse(null, "tenant update successful"));
			});
		});
	},

	"get": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }

			mongo.findOne(colName, {"_id": req.soajs.inputmaskData.id}, function(err, data) {
				if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
				return res.jsonp(req.soajs.buildResponse(null, data));
			});
		});
	},

	"deleteOAuth": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			var s = {'$set': {'oauth': {}}};
			mongo.update(colName, {"_id": req.soajs.inputmaskData.id}, s, {'upsert': false, 'safe': true}, function(error, tenantRecord) {
				if(error) { return res.jsonp(req.soajs.buildResponse({"code": 428, "msg": config.errors[428]})); }

				return res.jsonp(req.soajs.buildResponse(null, "tenant OAuth delete successful"));
			});
		});
	},

	"getOAuth": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {"_id": req.soajs.inputmaskData.id}, function(err, tenantRecords) {
				if(err) { return res.jsonp(req.soajs.buildResponse({"code": 427, "msg": config.errors[427]})); }
				return res.jsonp(req.soajs.buildResponse(null, tenantRecords.oauth));
			});
		});
	},

	"saveOAuth": function(config, code, msg, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			var s = {
				'$set': {
					oauth: {
						"secret": req.soajs.inputmaskData.secret,
						"redirectURI": req.soajs.inputmaskData.redirectURI,
						"grants": ["password", "refresh_token"]
					}
				}
			};
			mongo.update(colName, {"_id": req.soajs.inputmaskData.id}, s, {'upsert': false, 'safe': true}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": code, "msg": config.errors[code]})); }
				return res.jsonp(req.soajs.buildResponse(null, msg));
			});
		});
	},

	"deleteApplication": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 432, "msg": config.errors[432]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					tenantRecord.applications.splice(x.position[0], 1);
					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 432, "tenant application delete successful");
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 432, "msg": config.errors[432]}));
				}
			});
		});
	},

	"listApplication": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 431, "msg": config.errors[431]})); }
				return res.jsonp(req.soajs.buildResponse(null, tenantRecord.applications));
			});
		});
	},

	"addApplication": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			req.soajs.inputmaskData.productCode = req.soajs.inputmaskData.productCode.toUpperCase();
			req.soajs.inputmaskData.packageCode = req.soajs.inputmaskData.packageCode.toUpperCase();
			checkifProductAndPackageExist(req.soajs.inputmaskData.productCode, req.soajs.inputmaskData.packageCode, mongo, function(error, infoRecord) {
				if(error) { return res.jsonp(req.soajs.buildResponse({"code": 429, "msg": config.errors[429]})); }

				if(infoRecord === false) { return res.jsonp(req.soajs.buildResponse({"code": 434, "msg": config.errors[434]})); }

				mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
					if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 429, "msg": config.errors[429]})); }

					//for(var i = 0; i < tenantRecord.applications.length; i++) {
					//	if(tenantRecord.applications[i].product === req.soajs.inputmaskData.productCode) {
					//		if(tenantRecord.applications[i].package === req.soajs.inputmaskData.productCode + '_' + req.soajs.inputmaskData.packageCode) {
					//			return res.jsonp(req.soajs.buildResponse({"code": 433, "msg": config.errors[433]}));
					//		}
					//	}
					//}

					var newApplication = {
						"product": req.soajs.inputmaskData.productCode,
						"package": req.soajs.inputmaskData.productCode + '_' + req.soajs.inputmaskData.packageCode,
						"appId": new mongo.ObjectId(),
						"description": req.soajs.inputmaskData.description,
						"_TTL":    req.soajs.inputmaskData._TTL * 3600, // 24 hours
						"keys": []
					};
					if(req.soajs.inputmaskData.acl) {
						newApplication.acl = req.soajs.inputmaskData.acl;
					}
					tenantRecord.applications.push(newApplication);
					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 433, "tenant application add successful");
				});
			});
		});
	},

	"updateApplication": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			req.soajs.inputmaskData.productCode = req.soajs.inputmaskData.productCode.toUpperCase();
			req.soajs.inputmaskData.packageCode = req.soajs.inputmaskData.packageCode.toUpperCase();
			checkifProductAndPackageExist(req.soajs.inputmaskData.productCode, req.soajs.inputmaskData.packageCode, mongo, function(error, infoRecord) {
				if(error) { return res.jsonp(req.soajs.buildResponse({"code": 429, "msg": config.errors[429]})); }

				if(infoRecord === false) { return res.jsonp(req.soajs.buildResponse({"code": 434, "msg": config.errors[434]})); }

				mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
					if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 430, "msg": config.errors[430]})); }

					for(var i = 0; i < tenantRecord.applications.length; i++) {
						if(tenantRecord.applications[i].product === req.soajs.inputmaskData.productCode) {
							if(tenantRecord.applications[i].package === req.soajs.inputmaskData.productCode + '_' + req.soajs.inputmaskData.packageCode) {
								if(tenantRecord.applications[i].appId.toString() !== req.soajs.inputmaskData.appId) {
									return res.jsonp(req.soajs.buildResponse({"code": 433, "msg": config.errors[433]}));
								} else {
									tenantRecord.applications[i].product = req.soajs.inputmaskData.productCode;
									tenantRecord.applications[i].package = req.soajs.inputmaskData.productCode + '_' + req.soajs.inputmaskData.packageCode;
									tenantRecord.applications[i].description = req.soajs.inputmaskData.description;
									tenantRecord.applications[i]._TTL = req.soajs.inputmaskData._TTL * 3600;
									if(req.soajs.inputmaskData.acl) {
										tenantRecord.applications[i].acl = req.soajs.inputmaskData.acl;
									}
								}
							}
						}
					}
					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 430, "tenant application update successful");
				});
			});
		});
	},

	"createApplicationKey": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 436, "msg": config.errors[436]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					var provision = require("soajs/modules/soajs.provision");
					provision.init(req.soajs.registry.coreDB.provision, req.soajs.log);
					provision.generateInternalKey(function(error, internalKey) {
						if(error) {
							return res.jsonp(req.soajs.buildResponse({"code": 436, "msg": config.errors[436]}));
						}

						tenantRecord.applications[x.position[0]].keys.push({
							"key": internalKey,
							"extKeys": [],
							"config": {}
						});
						saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 436, "application key add successful");
					});
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 436, "msg": config.errors[436]}));
				}
			});
		});
	},

	"getApplicationKeys": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 435, "msg": config.errors[435]})); }
				var keys = [];
				//find the application
				tenantRecord.applications.forEach(function(oneApplication) {
					if(oneApplication.appId.toString() === req.soajs.inputmaskData.appId) {
						keys = oneApplication.keys;
					}
				});
				return res.jsonp(req.soajs.buildResponse(null, keys));
			});
		});
	},

	"deleteApplicationKey": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 437, "msg": config.errors[437]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					tenantRecord.applications[x.position[0]].keys.splice(x.position[1], 1);
					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 437, "application key remove successful");
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 437, "msg": config.errors[437]}));
				}
			});
		});
	},

	"listApplicationExtKeys": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 442, "msg": config.errors[442]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					return res.jsonp(req.soajs.buildResponse(null, tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys));
				} else {
					return res.jsonp(req.soajs.buildResponse(null, []));
				}
			});
		});
	},

	"addApplicationExtKeys": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 440, "msg": config.errors[440]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					var provision = require("soajs/modules/soajs.provision");
					provision.init(req.soajs.registry.coreDB.provision, req.soajs.log);
					provision.generateExtKey(req.soajs.inputmaskData.key, req.soajs.servicesConfig.key, function(error, extKeyValue) {
						if(error) { return res.jsonp(req.soajs.buildResponse({"code": 440, "msg": config.errors[440]})); }

						var newExtKey = {
							"expDate": new Date(req.soajs.inputmaskData.expDate).getTime() + config.expDateTTL,
							"extKey": extKeyValue,
							"device": req.soajs.inputmaskData.device,
							"geo": req.soajs.inputmaskData.geo
						};
						//push new extKey
						tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys.push(newExtKey);
						saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 440, "tenant application ext key add successful");
					});
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 440, "msg": config.errors[440]}));
				}
			});
		});
	},

	"updateApplicationExtKeys": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 441, "msg": config.errors[441]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys[x.position[2]].expDate = new Date(req.soajs.inputmaskData.expDate).getTime() + config.expDateTTL;
					tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys[x.position[2]].device = req.soajs.inputmaskData.device;
					tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys[x.position[2]].geo = req.soajs.inputmaskData.geo;

					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 441, "tenant application ext key update successful");
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 441, "msg": config.errors[441]}));
				}
			});
		});
	},

	"deleteApplicationExtKeys": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 443, "msg": config.errors[443]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					tenantRecord.applications[x.position[0]].keys[x.position[1]].extKeys.splice(x.position[2], 1);
					saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 443, "tenant application ext key delete successful");
				} else {
					return res.jsonp(req.soajs.buildResponse({"code": 443, "msg": config.errors[443]}));
				}
			});
		});
	},

	"updateApplicationConfig": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			req.soajs.inputmaskData.envCode = req.soajs.inputmaskData.envCode.toUpperCase();
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 445, "msg": config.errors[445]})); }

				checkIfEnvironmentExists(mongo, req.soajs.inputmaskData.envCode, function(error, exists) {
					if(error) { return res.jsonp(req.soajs.buildResponse({"code": 445, "msg": config.errors[445]})); }

					if(!exists) { return res.jsonp(req.soajs.buildResponse({"code": 446, "msg": config.errors[446]})); }

					var x = getRequestedSubElementsPositions(tenantRecord, req);
					if(x.found) {
						tenantRecord.applications[x.position[0]].keys[x.position[1]].config[req.soajs.inputmaskData.envCode] = req.soajs.inputmaskData.config;
						saveTenantRecordAndExit(mongo, tenantRecord, config, req, res, 445, "tenant application configuration update successful");
					} else {
						return res.jsonp(req.soajs.buildResponse({"code": 445, "msg": config.errors[445]}));
					}
				});
			});
		});
	},

	"listApplicationConfig": function(config, mongo, req, res) {
		validateId(mongo, req, function(err) {
			if(err) { return res.jsonp(req.soajs.buildResponse({"code": 438, "msg": config.errors[438]})); }
			mongo.findOne(colName, {'_id': req.soajs.inputmaskData.id}, function(error, tenantRecord) {
				if(error || !tenantRecord) { return res.jsonp(req.soajs.buildResponse({"code": 444, "msg": config.errors[444]})); }

				var x = getRequestedSubElementsPositions(tenantRecord, req);
				if(x.found) {
					return res.jsonp(req.soajs.buildResponse(null, tenantRecord.applications[x.position[0]].keys[x.position[1]].config));
				} else {
					return res.jsonp(req.soajs.buildResponse(null, {}));
				}
			});
		});
	}
};