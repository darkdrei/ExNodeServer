
module.exports = {
	listenings : {},

	get_webusers: function(type){
		return this.listenings[type];
	},

	add_messages_by_type: function (type, messages, callback){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		for (var webuser in this.listenings[type]){
			if (this.listenings[type][webuser] == undefined){
				this.listenings[type][webuser] = {'sessions': {}, 'messages': [] };
			}

			for (var i in messages) {
				var message_id = this.listenings[type][webuser]['messages'].length.toString(16);
				messages[i]['message_id'] = message_id;
				messages[i]['_visited_'] = [];
				this.listenings[type][webuser]['messages'][message_id] = messages[i];
				for (var django_id in this.listenings[type][webuser]['sessions']){
					var socket = this.listenings[type][webuser]['sessions'][django_id];
					callback(django_id, socket, messages[i]);
				}
			}
		}
	},

	add_messages: function (type, webuser, messages){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}

		for (var i in messages){
			var message_id = this.listenings[type][webuser]['messages'].length.toString(16);
			messages[i]['message_id'] = message_id;
			messages[i]['_visited_'] = [];
			this.listenings[type][webuser]['messages'][message_id] = messages[i];
		}
	},

	visit_message: function (type, webuser, message_id, session_id, callback){
		this.listenings[type][webuser]['messages'][message_id]['_visited_'].push(session_id);

		for (var session_id in this.listenings[type][webuser]['sessions']){
			callback(session_id, this.listenings[type][webuser]['sessions'][session_id], message_id);
		}
	},

	add_session: function (type, webuser, session, socket){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}
		if (this.listenings[type][webuser]['sessions'][session] == undefined){
			this.listenings[type][webuser]['sessions'][session] = {};
		}

		this.listenings[type][webuser]['sessions'][session][socket.id] = socket;
	},

	get_messages: function (type, webuser){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}

		return this.listenings[type][webuser]['messages'];
	},

	get_sessions: function (type, webuser){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}

		return this.listenings[type][webuser]['sessions'];
	},

	delete_messages: function (type, webuser, message_id){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}

		delete this.listenings[type][webuser]['messages'][message_id];
	},

	delte_session: function (type, webuser, session, socket_id){
		if (this.listenings[type] == undefined){
			this.listenings[type] = {};
		}
		if (this.listenings[type][webuser] == undefined){
			this.listenings[type][webuser] = {'sessions': {}, 'messages': []};
		}

		delete this.listenings[type][webuser]['sessions'][session][socket_id];
	}

};