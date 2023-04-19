# nginxplus_dynamic_rewrites

This demo requires an NGINX+ repository key and cert (the build will fail if the files are not in place). Place the .key and .crt files in ./plus-build of this repo before running docker-compose. If you are not a current NGINX+ customer, you can request a free 30-day trial at https://www.nginx.com/free-trial-request/

In addition to the key/cert you will need:

* docker, docker-compose
* authorization to build containers
* authorization to forward host ports
* ports 80, 81, 82, 88, 89 open on your host. If you need to change the ports you can modify docker-compose.yaml

Clone this repo and use docker-compose to bring up the environment:


    git clone https://github.com/timquinlan/nginxplus_dynamic_rewrites
    cp nginx-repo.crt nginx-repo.key nginxplus_dynamic_rewrites/plus-build
    cd nginxplus_dynamic_rewrites
    docker-compose up

The most common way to manage rewrites is with a map. This method is robust but static; any changes to the map will require a reload.  This demo explores using the NGINX+ keyvalue store to augment a map. I chose the keyvalue store since one can create/update/remove entries on the fly with an api call.  The demo is a docker-compose instance that spins up just one node, that node has multiple virtual servers that do different things.  Before moving forward, you must populate the keyvalue stores with the appropriate test data.  These commands populate two separate keyvalue zones: rewrites and csv_data.  Rewrites is used in the second scenario and csv_data is used in the third scenario.


    curl -s -X POST -d '{"/abc":"/rewritten"}' localhost/api/8/http/keyvals/rewrites
    curl -s -X POST -d '{"/def":"/rewritten"}' localhost/api/8/http/keyvals/rewrites
    curl -s -X POST -d '{"/abc":"/rewritten,1649277630,1996343255"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2022 until apr/5/2033
    curl -s -X POST -d '{"/def":"/rewritten,1649277630,1680637655"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2022 until apr/4/2023
    curl -s -X POST -d '{"/xyz":"/rewritten,1838666430,1996343255"}' localhost/api/8/http/keyvals/csv_data #valid from apr/6/2028 until apr/5/2033 

Use the NGINX+ API to check the keyvalue stores are populated:


    $ curl -s localhost/api/8/http/keyvals | jq
        {
          "csv_data": {
            "/abc": "/rewritten,1649277630,1996343255",
            "/def": "/rewritten,1649277630,1680637655",
            "/xyz": "/rewritten,1838666430,1996343255"
          },
          "rewrites": {
            "/abc": "/rewritten",
            "/def": "/rewritten"
          }
        }

**Virtual Server Overview and Test Cases**

**Port 88:** acts as an upstream for the other servers to proxy_pass to, you won't interact with it directly.

**Port 89:** acts as a server to redirect to, you won't interact with it directly. Only used if you change the rewrite directives to "return 301 ....".

**Port 80:** prior to any content handling the map of uris is examined to evaluate if there is a rewrite entry, if there is it will rewrite the URI to the new value. This is the base configuration that we'll build on throughout the demo: 


    map $uri $map_uri {
       default "";
       /123 /rewritten;
       /456 /rewritten;
    }
    
    server {
        listen 80;
        server_name localhost;
    
        if ($map_uri) {
           rewrite ^(.*)$ $map_uri last;
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

The test cases are:


    $ curl localhost:80/abc
    content handled by proxy_pass
    $ curl localhost:80/123
    this is the rewritten location
    $ curl localhost:80/456
    this is the rewritten location
    $ curl localhost:80/789
    content handled by proxy_pass


**Port 81:** prior to any content handling the map of uris is examined to evaluate if there is a rewrite entry, if there is it will rewrite the URI to the new value. If there is no entry in the map, the keyvalue store named rewrites is examined for a rewrite entriy, if there is it will rewrite to the new URI. 


    keyval_zone zone=rewrites:1m;
    keyval $uri $kv_uri zone=rewrites;
    
    server {
        listen 81;
    
        if ($map_uri) {
           rewrite ^(.*)$ $map_uri last;
        }
    
        if ($kv_uri) {
           rewrite ^(.*)$ $kv_uri last;
        }
    
        location / {
            proxy_pass http://local_upstream;
        }
    
        location /rewritten {
            return 200 "this is the rewritten location\n";
        }
    
        location /expired {
            return 200 "that redirect is expired\n";
        }
    
        location /api {
            # don't use this in prod without adding some security!!!
            api write=on;
        }
    
        location = /dashboard.html {
            root /usr/share/nginx/html;
        }
    }


The test cases are:


    $ curl localhost:81/abc
    this is the rewritten location
    $ curl localhost:81/def
    this is the rewritten location
    $ curl localhost:81/123
    this is the rewritten location
    $ curl localhost:81/456
    this is the rewritten location
    $ curl localhost:81/789
    content handled by proxy_pass

**Port 82:** prior to any content handling  the map of uris is examined to evaluate if there is a rewrite entry, if there is it will rewrite the URI to the new value. If there is no entry in the map, the keyvalue store named csv_data is examined for a rewrite entriy, NJS is invoked to examine the entry and if the current time is between the timestamps the URI is rewritten.

NJS called twice every request in this example.  The csv_rewrite function checks the csv_data keyval zone, and determines if the current time is between the start and expire time of the rewrite.  If so, it sets evaluate_rewrite to 1, triggering a rewwrite.  If the current time is after the expiry time it sets evaluate_rewrite to 2, triggering a rewrite to the /expired location.  If there is no entry, or the current time is before the start time, evaluate_rewrite is set to 0 causing nginx to bypass the if statemnets and continue on its normal flow of content handling.  Each request also checks the set_uri function.  This is only actually required if evaluate_rewrite is set to 1, however since js_set cannot be placed in an if statement, set_uri gets called whether it is needed or not. 


    function csv_rewrite(r) {
        if (r.variables.csv_data) {
             const now = Math.floor(Date.now() / 1000);
             let fields = r.variables.csv_data.split(",");
             let start = fields[1];
             let expire = fields[2];
             if (start <= now && now <= expire ) {
                 return(1);
             } else if (now >= expire) {
                 return(2);
             }
        }
        return(0); //catch all
    }
    
    function set_uri(r) {
        if (r.variables.csv_data) {
           let fields = r.variables.csv_data.split(",");
           return(fields[0]);
        }
            return;
        }
        
        export default {csv_rewrite, set_uri}
    
    
The nginx.conf for this method:
    
    
    keyval_zone zone=csv_data:1m;
    keyval $uri $csv_data zone=csv_data;
    
    server {
        listen 82;
    
        if ($map_uri) {
           rewrite ^(.*)$ $map_uri last;
        }
    
        js_import /etc/nginx/njs/csv_rewrite.js;
        js_set $evaluate_rewrite csv_rewrite.csv_rewrite;
        js_set $uri_from_csv csv_rewrite.set_uri;
    
        if ($evaluate_rewrite = 1) {
           rewrite ^(.*)$ $uri_from_csv last;
        }
    
        if ($evaluate_rewrite = 2) {
           rewrite ^(.*)$ /expired last;
        }
    
        location / {
            proxy_pass http://local_upstream;
        }
    
        location /rewritten {
            return 200 "this is the rewritten location\n";
        }
    
        location /expired {
            return 200 "that redirect is expired\n";
        }
    
        location /api {
            # don't use this in prod without adding some security!!!
            api write=on;
        }
    
        location = /dashboard.html {
            root /usr/share/nginx/html;
        }
    }

 
We created a keyvalue zone csv_data and populated it with entries for /abc, /def and /xyz.  The csv_data also include start and expiry times for each entry.  The entry for /abc is valid from apr/6/2022 until apr/5/2033, this is a valid rewrite. The entry for /def is valid from apr/6/2022 until apr/4/2023, this is an expired rewrite.  /xyz is valid from apr/6/2028 until apr/4/2023, this rewrite is not yet valid, the logic will simply ignore it and proceed with the normal content handling.  The flow is to first check the map and rewrite if there is a match, second check the keyvalue store and rewrite if there is a match, and finally if no matches are found continue on with normal content handling. The test cases are:


    $ curl localhost:82
    content handled by proxy_pass
    $ curl localhost:82/abc
    this is the rewritten location
    $ curl localhost:82/def
    that redirect is expired
    $ curl localhost:82/xyz
    content handled by proxy_pass
    $ curl localhost:82/123
    this is the rewritten location
    $ curl localhost:82/456
    this is the rewritten location
    $ curl localhost:82/789
    content handled by proxy_pass



