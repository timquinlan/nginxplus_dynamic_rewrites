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
