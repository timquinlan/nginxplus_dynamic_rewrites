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
    curl -s -X POST -d '{"/abc":"1996343255"}' localhost/api/8/http/keyvals/timebounds # apr/5/2033 NOT expired
    curl -s -X POST -d '{"/def":"1680637655"}' localhost/api/8/http/keyvals/timebounds # apr/4/2023 IS expired 

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
    
        location = /dashboard.html {
        root /usr/share/nginx/html;
        }
    }

The following test cases apply to this virtual server:
We created a keyvalue zone called rewrites and populated it with entries for /abc and /def.  

**Port 81:** prior to any content handling it NJS to evaluate the keyvalue store, additionally there is a second keyvalue store that contains expire dates for the rewrite.  

**Port 82:** **WIP/Mental Design Phase** the idea is to pack the new uri, start time and expiry time into some sort of delimited data or maybe JSON then use NJS to unpack and evaluate the data.



