var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var file = 'db.sqlite3';
var db = new sqlite3.Database(file);
var exists = fs.existsSync(file);

if (exists){
	fs.unlinkSync(file);
}

function hash(username, password, usertype){
	return new Buffer(username+'/'+password + '/' + usertype).toString('base64')
}

db.serialize(function() {
  db.run("CREATE TABLE user (username TEXT, password TEXT, usertype TEXT)");

  var stmt = db.prepare("INSERT INTO user VALUES (?, ?, ?)");
  
  username = "user1"
  password = "123456"
  usertype = "CELL"

  stmt.run([username, hash(username, password, usertype), usertype]);

  username = "user2"
  password = "123456"
  usertype = "WEB"

  stmt.run([username, hash(username, password, usertype), usertype]);

  stmt.finalize();

  db.each("SELECT * FROM user", function(err, row) {
      console.log(row.username + ", " + row.password);
  });
});

db.close();