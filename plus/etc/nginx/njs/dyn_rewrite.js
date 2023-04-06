function dyn_rewrite(r) {
    if (r.variables.newuri) {
         const now = Math.floor(Date.now() / 1000);
         if (now < r.variables.epochtimeout) {
             return(1);
         } else if (now >= r.variables.epochtimeout) {
             return(2);
         } 
    } 
    return(0); //catch all
}

export default {dyn_rewrite}
