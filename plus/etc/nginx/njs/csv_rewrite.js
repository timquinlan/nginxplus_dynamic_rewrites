function csv_rewrite(r) {
    if (r.variables.csv_data) {
         const now = Math.floor(Date.now() / 1000);
         let data_fields = r.variables.csv_data.split(",");
         let start = data_fields[1];
         let expire = data_fields[2];
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
       let data_fields = r.variables.csv_data.split(",");
       return(data_fields[0]);
    }
    return;
}

export default {csv_rewrite, set_uri}
