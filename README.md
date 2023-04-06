# nginxplus_dynamic_rewrites

This demo requires an NGINX+ repository key and cert (the build will fail if the files are not in place). Place the .key and .crt files in ./plus-build of this repo before running docker-compose. If you are not a current NGINX+ customer, you can request a free 30-day trial at https://www.nginx.com/free-trial-request/

In addition to the key/cert you will need:

* docker, docker-compose
* authorization to build containers
* authorization to forward host ports

Clone this repo and use docker-compose to bring up the environment:


    git clone https://github.com/timquinlan/nginxplus_dynamic_rewrites
    cp nginx-repo.crt nginx-repo.key nginxplus_dynamic_rewrites/plus-build
    cd nginxplus_dynamic_rewrites
    docker-compose up

This demo explores using the NGINX+ keyvalue store to store rewrite info. I chose the keyvalue store since one can create/update/remove entries on the fly with an api call.  The demo is a docker-compose instance that spins up just one node, that node has multiple virtual servers that do different things.  Before moving forward, you must populate the keyvalue stores with the appropriate test data:


    curl -s -X POST -d '{"/abc":"/rewritten"}' localhost/api/8/http/keyvals/rewrites
    curl -s -X POST -d '{"/def":"/rewritten"}' localhost/api/8/http/keyvals/rewrites
    curl -s -X POST -d '{"/abc":"1996343255"}' localhost/api/8/http/keyvals/timebounds #expires on apr/5/2033
    curl -s -X POST -d '{"/def":"1680637655"}' localhost/api/8/http/keyvals/timebounds #expired on apr/4/2023
    curl -s -X POST -d '{"/abc":"/rewritten,1649277630,1996343255"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2022 until apr/5/2033
    curl -s -X POST -d '{"/def":"/rewritten,1649277630,1680637655"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2022 until apr/4/2023
    curl -s -X POST -d '{"/xyz":"/rewritten,1838666430,1996343255"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2028 until apr/5/2033 

Use the NGINX+ API to check the keyvalue stores are populated:


    curl -s localhost/api/8/http/keyvals | jq
    {
      "timebounds": {
        "/abc": "1996343255",
        "/def": "1680637655"
      },
      "rewrites": {
        "/abc": "/rewritten",
        "/def": "/rewritten"
      }
    }

**Virtual Server Overview and Test Cases**

**Port 88:** acts as an upstream for the other servers to proxy_pass to. You won't interact with it directly.

**Port 80:** uses an if statement before any content handling to evaluate if there is a rewrite entry in the keyvalue store, if there is it will rewrite the URI to the new value.  I included this to show that it can be done with out any additional logic beyond what is available in  normal nginx directives.  If one was to implement this, one would have to develop a method outside of NGINX to manage the keyvalue store entries, as this method simple executes a rewrite if there is an entry in the keyvalue store.  Check the file "api_cmds" for the approriate POST and PATCH curl commands to do so.  


    keyval_zone zone=rewrites:1m;
    keyval $uri $newuri zone=rewrites;

    server {
        listen 80;
        server_name localhost;
    
        if ($newuri) {
           rewrite ^(.*)$ $newuri last;
        }
    
        location / {
            proxy_pass http://local_upstream;
        }
    
        location /rewritten {
            return 200 "this is the rewritten location\n";
        }
    
        location /api {
            # don't use this in prod without adding some security!!!
            api write=on;
        }
    }

We created a keyvalue zone called rewrites and populated it with entries for /abc and /def.  The following test cases apply to this virtual server:


    $ curl localhost:80/
    content handled by proxy_pass
    $ curl localhost:80/abc
    this is the rewritten location
    $ curl localhost:80/def
    this is the rewritten location

**Port 81:** prior to any content handling it uses NJS to evaluate the keyvalue store, if there is a rewrite present for the current URI it will check the timebounds keyvalue store and evaluate if the rewrite has has expired or not.  

The njs for this example is called on every request.  The dyn_rewrite function checks the rewrites keyval zone, if there is no rewrite for the current uri it sets $testval to 0, causing nginx to bypass the if statemnets and continue on its normal flow of content handling.  If there is a rewrite for the current uri it checks the timebounds keyval zone and determines if the rewrite is not expired.  If the rewrite is timebound is in the past, it sets $testval to 1 which will execute a rewrite to the defined uri. If it is invalid it sets $testval to 2 which will execute a rewrite to the /expired location.


    function dyn_rewrite(r) {
        if (r.variables.newuri) {
             const now = Math.floor(Date.now() / 1000);
             if (now < r.variables.epochtimeout) {
                 return(1);
             } else if (now > r.variables.epochtimeout) {
                 return(2);
             }
        }
        return(0); //catch all
    }
    
    export default {dyn_rewrite}

The nginx.conf for this method is similar to the previous example.  It uses the keyvalue zone (rewrites) from the previous example. However, note that there is an additional keyval zone called timebounds, a js_set call and two if statements:

    keyval_zone zone=timebounds:1m;
    keyval $uri $epochtimeout zone=timebounds;
    
    server {
        listen 81;
    
        js_import /etc/nginx/njs/dyn_rewrite.js;
        js_set $testval dyn_rewrite.dyn_rewrite;
    
        if ($testval = 1) {
           rewrite ^(.*)$ $newuri last;
        }
    
        if ($testval = 2) {
           rewrite ^(.*)$ /expired last;
        }
    
        location / {
            proxy_pass http://local_upstream;
        }
    
        location /rewritten {
            return 200 "this is the rewritten location\n";
        }
    
        location /expired {
            return 200 "that rewrite is expired\n";
        }
    
        location /api {
            # don't use this in prod without adding some security!!!
            api write=on;
        }
    
        location = /dashboard.html {
            root /usr/share/nginx/html;
        }
    }

We created a keyvalue zone called rewrites and populated it with entries for /abc and /def.  We also created a keyvalue zone called timebounds and set /abc's timebound as sometime in the future, and set /def's timebound as sometime in the past. The following test cases apply to this virtual server:


    $ curl localhost:81/
    content handled by proxy_pass
    $ curl localhost:81/abc
    this is the rewritten location
    $ curl localhost:81/def
    that redirect is expired

**Port 82:** **WIP/Design Phase** the idea is to pack the new uri, start time and expiry time into some sort of delimited data or JSON into the KV then use NJS to unpack and evaluate the data.



