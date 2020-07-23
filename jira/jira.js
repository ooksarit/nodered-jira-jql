module.exports = function(RED) {


    function JiraIssueUpdateNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var jql = config.jql;
        var server = RED.nodes.getNode(config.server);


        this.on('input', function(msg) {
            var issueKey = msg.topic;
            var updateParameters = msg.payload;
            this.log("Updating issue '" + issueKey + "'");

            if (!issueKey || !updateParameters) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Invalid message received"
                });
            }
            var callback = function(errors, response, body) {
                if (response.statusCode === 204) {
                    node.status({});
                    node.send(msg);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Update failed"
                    });
                    node.error("Error updating issue (" + response.statusCode + "): " + JSON.stringify(errors) + " " + JSON.stringify(body));
                }

            };
            node.status({
                fill: "blue",
                shape: "dot",
                text: "Requesting..."
            });
            server.edit(issueKey, updateParameters, callback);
        });
    }

    function JiraSearchNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        //var jql = config.jql;
        var server = RED.nodes.getNode(config.server);
        var maxIssues = config.pagesize || 1000;


        this.on('input', function(msg) {
            var jql = config.jql || msg.jql;
            this.log("Performing search '" + jql + "'");
            node.perform(jql, function(issue, index, array) {
                msg.topic = issue.key;
                msg.result = issue;
                node.send(RED.util.generateId(), msg);
            });
        });

        this.perform = function(jql, callback, startIndex = 0) {

            var toIndex = startIndex + maxIssues;
            var options = {
                "startAt": startIndex,
                "maxResults": maxIssues,
                "fields": ["key", "title", "summary", "labels", "status", "issuetype", "description", "reporter", "created", "environment","priority","comment", "project"]
            };
            var rqcallback = function(errors, response, body) {
                if (errors) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error processing search. " + JSON.stringify(errors));
                } else if (response.statusCode === 200) {
                    node.status({});
                    var issues = body;
                    if (issues) {

                        node.log("Processing issues " + startIndex + " to " + toIndex + " of total " + issues.total);
                        //console.log(issues);
                        issues.issues.forEach(callback);
                    }

                    if (issues.total > toIndex) {
                        node.log("Recursing");
                        node.perform(jql, callback, startIndex + maxIssues);
                    }

                } else if (response.statusCode === 400) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Invalid JQL"
                    });
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error processing search. status=" + response.statusCode + " errors=" + JSON.stringify(response));
                }


            };

            node.status({
                fill: "blue",
                shape: "dot",
                text: "Requesting..."
            });
            server.search(jql, options, rqcallback);
        }
    }

    function JiraServerNode(config) {
        RED.nodes.createNode(this, config);
        this.log(config);
        var node = this;
        var url = config.url;
        var user = this.credentials.username;
        var password = this.credentials.password;
        var request = require("request");


        this.doRequest = function(options, callback) {
            options.auth = {
                'user': user,
                'pass': password
            };
            this.log("DoRequest " + options);
            request(options, callback);
        }

        this.create_comment = function(issuekey,commentDefinition,callback){
          var options = {
              rejectUnauthorized: false,
              uri: decodeURIComponent(url + 'issue/'+issuekey+'/comment'),
              body: commentDefinition,
              method: 'POST',
              followAllRedirects: true,
              json: true
          };
          node.doRequest(options, callback);
        }

        this.update_comment = function(issuekey,commentDefinition,callback){
          var options = {
              rejectUnauthorized: false,
              uri: decodeURIComponent(url + 'issue/'+issuekey+'/comment'),
              body: commentDefinition,
              method: 'PUT',
              followAllRedirects: true,
              json: true
          };
          node.doRequest(options, callback);
        }

        this.create = function(issueDefinition, callback) {
            var options = {
                rejectUnauthorized: false,
                uri: decodeURIComponent(url + 'issue'),
                body: issueDefinition,
                method: 'POST',
                followAllRedirects: true,
                json: true
            };
            node.doRequest(options, callback);
        }

        this.get = function(issueKey, callback) {
            var options = {
                rejectUnauthorized: false,
                uri: decodeURIComponent(url + 'issue/' + issueKey),
                body: null,
                method: 'GET',
                followAllRedirects: true,
                json: true
            };
            node.doRequest(options, callback);
        }

        this.edit = function(issueKey, updateRequest, callback) {
            var options = {
                rejectUnauthorized: false,
                uri: decodeURIComponent(url + 'issue/' + issueKey),
                body: updateRequest,
                method: 'PUT',
                followAllRedirects: true,
                json: true
            };
            node.doRequest(options, callback);
        }

        this.search = function(jql, options, callback) {

            var options = {
                rejectUnauthorized: false,
                uri: decodeURIComponent(url + 'search'),
                method: 'POST',
                json: true,
                followAllRedirects: true,

                body: {
                    jql: jql,
                    startAt: options.startAt || 0,
                    maxResults: options.maxResults || 1000,
                    fields: options.fields || ["summary", "status", "key", "issuetype"],
                    expand: options.expand || ['schema', 'names']
                }
            };
            this.log("Calling dorequest");
            this.doRequest(options, callback);
        }


    }

    function JiraIssueGetNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var jql = config.jql;
        var property_key = config.key;
        var property_body = config.body;
        var server = RED.nodes.getNode(config.server);


        this.on('input', function(msg) {
            var issueKey = msg.topic;
            this.log("Retrieving issue '" + issueKey + "'");

            if (!issueKey) {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Invalid message received"
                });
            }
            var callback = function(errors, response, body) {
                if (errors) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error processing search. " + JSON.stringify(errors));
                } else if (response.statusCode === 200) {
                    node.status({});

                    msg[property_key] = response.body.key;
                    msg[property_body] = response.body
                    node.send(msg);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Get failed"
                    });
                    node.error("Error getting issue (" + response.statusCode + "): " + JSON.stringify(response));
                }

            };
            node.status({
                fill: "blue",
                shape: "dot",
                text: "Requesting..."
            });
            server.get(issueKey, callback);
        });
    }


    function JiraIssueCreateNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var server = RED.nodes.getNode(config.server);

        this.on('input', function(msg) {
            var issueDefinition = msg;
            var callback = function(errors, response, body) {
                if (errors) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error creating issue. " + JSON.stringify(errors));
                } else if (response.statusCode === 201) {
                    node.status({});
                    msg.topic = response.body.key;
                    node.send(msg);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Create failed"
                    });
                    node.error("Error creating issue (" + response.statusCode + "): " + JSON.stringify(response));
                }

            };
            server.create(msg.payload, callback);
        });


    }

    function JiraIssueCommentAddNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var server = RED.nodes.getNode(config.server);

        this.on('input', function(msg) {
            var commentDefinition = msg.payload;
            var callback = function(errors, response, body) {
                if (errors) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error creating comment. " + JSON.stringify(errors));
                } else if (response.statusCode === 201) {
                    node.status({});
                    msg.payload=body;
                    node.send(msg);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Create failed"
                    });
                    node.error("Error creating issue (" + response.statusCode + "): " + JSON.stringify(response));
                }

            };
            server.create_comment(msg.topic,msg.payload, callback);
        });
    }

    function JiraIssueCommentEditNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var server = RED.nodes.getNode(config.server);

        this.on('input', function(msg) {
            var commentDefinition = msg.payload;
            var callback = function(errors, response, body) {
                if (errors) {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Error performing request"
                    });
                    node.error("Error editing comment. " + JSON.stringify(errors));
                } else if (response.statusCode === 201) {
                    node.status({});
                    msg.payload=body;
                    node.send(msg);
                } else {
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: "Create failed"
                    });
                    node.error("Error creating issue (" + response.statusCode + "): " + JSON.stringify(response));
                }

            };
            server.update_comment(msg.topic,msg.payload, callback);
        });
    }


    RED.nodes.registerType("jira-server", JiraServerNode, {
        credentials: {
            username: {
                type: "text"
            },
            password: {
                type: "password"
            }
        }
    });
    RED.nodes.registerType("jira-search", JiraSearchNode);
    RED.nodes.registerType("jira-issue-update", JiraIssueUpdateNode);
    RED.nodes.registerType("jira-issue-get", JiraIssueGetNode);
    RED.nodes.registerType("jira-issue-create", JiraIssueCreateNode);
    RED.nodes.registerType("jira-issue-comment-add", JiraIssueCommentAddNode);
    RED.nodes.registerType("jira-issue-comment-update", JiraIssueCommentEditNode);
}
