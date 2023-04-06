# nginxplus_dynamic_redirect

I put this together to explore using the NGINX+ keyvalue store to store rewrite info.  It is a docker-compose instance that spins up just one node, that node has multiple virtual servers that do different things: 
 - Port 80: uses an if statement to evaluate if there is a rewrite for
 - Port 81: uses
 - Port 82
 - Port 88

one node instance of plus to do to test conditional redirects. proxy passes to itself on port 81

The server listening on 80 will use ifs and KV

The server listening on 81 server will use NJS and KV

