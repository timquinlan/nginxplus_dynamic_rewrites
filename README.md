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

This demo explores using the NGINX+ keyvalue store to store rewrite info. I chose the KV store since one can create/update/remove entries on the fly with an api call.  The demo is a docker-compose instance that spins up just one node, that node has multiple virtual servers that do different things.  Before moving forward, you must populate the KV stores with the appropriate test data:


    curl -s -X POST -d '{"/abc":"/redirected"}' localhost/api/8/http/keyvals/redirects
    curl -s -X POST -d '{"/abc":"1996343255"}' localhost/api/8/http/keyvals/timebounds #this time is apr/5/2033 so it won't be expired for quite some time
    curl -s -X POST -d '{"/def":"/redirected"}' localhost/api/8/http/keyvals/redirects
    curl -s -X POST -d '{"/def":"1680637655"}' localhost/api/8/http/keyvals/timebounds #this time is apr/4/2023 so it is expired 

Use the NGINX+ API to check the keyvalue stores:


    curl -s localhost/api/8/http/keyvals | jq
    {
      "timebounds": {
        "/abc": "1996343255",
        "/def": "1680637655"
      },
      "redirects": {
        "/abc": "/redirected",
        "/def": "/redirected"
      }
    }

**Port 80:** uses an if statement before any content handling to evaluate if there is a rewrite entry in the KV store, if there is it will rewrite the URI to the new value.  I included this to show that it can be done with out any additional logic.  If one was to implement this, one would have to develop a method outside of NGINX to manage the KV store entries.  Check the file "api_cmds: for the approriate POST and PATCH curl commands to do so.  

**Port 81:** uses NJS to evaluate the KV store, additionally there is a second KV store that contains expire dates for the rewrite.  

**Port 82:** **Still a WIP** initial design is to pack the new uri, start time and expiry time into some sort of delimited data or maybe JSON then use NJS to unpack and evaluate the data.

**Port 88:** acts as an upstream for the other servers to proxy_pass to.





