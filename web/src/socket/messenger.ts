import logger from '../logger/logger';
import * as uuid from 'uuid';

function getProtocol(): 'ws:' | 'wss:' {
	if (window.location.protocol == 'https:') {
		return 'wss:';
	}
	return 'ws:';
}

export class MessengerError extends Error {}

export class Messenger<EventTypes extends string, Message> {
	constructor(public address: string, public protocols = ['silly-game']) {
		if (address.includes('ws')) {
			throw new MessengerError(
				'Address must not include ws/wss protocol'
			);
		}
		this.socket = this._getNewSocket();
	}

	clientId: string | null = null;

	private _getNewSocket() {
		const ws = new WebSocket(getProtocol() + this.address, this.protocols);
		ws.onopen = function (ev) {
			logger.info('socket open', ev);
		};
		ws.onclose = function (ev) {
			logger.debug('socket closed', ev.code, ev.reason);
		};
		ws.onerror = function (ev) {
			logger.error('socket error', ev);
		};

		ws.onmessage = (ev) => {
			let parsed;
			try {
				parsed = JSON.parse(ev.data);
			} catch (e) {
				throw new MessengerError(`Messenger JSON.parse err: ${e}`);
			}

			logger.info(`Messenger#onMessage(type: ${parsed.event}): `, parsed);
			const callback = this.callbacks.get(parsed.event);

			if (callback) {
				callback(parsed);
			}
		};
		return ws;
	}

	socket!: WebSocket;
	closed = false;
	private callbacks: Map<EventTypes, (data: Message) => void> = new Map();

	register(clientId: string) {
		logger.info('client id is ', clientId);
		this.clientId = clientId;
	}

	send(
		req: Message & {
			id?: string;
			ts?: number;
		},
		attempts = 0,
		sleepMs = 0
	): void {
		if (attempts > 5) {
			return;
		}

		if (sleepMs) {
			sleepSync(sleepMs);
		}

		req['id'] = uuid.v4();
		req['ts'] = Date.now();
		const msg = JSON.stringify(req);
		logger.debug(`Messenger#send`, msg);

		switch (this.socket.readyState) {
			case WebSocket.CONNECTING:
				return this.send(req, attempts + 1, sleepMs + 10);
			case WebSocket.CLOSED:
			case WebSocket.CLOSING:
				this.socket = this._getNewSocket();
				return this.send(req, attempts + 1, sleepMs + 10);
			default:
				this.socket.send(msg);
		}
	}

	onMessage(type: EventTypes, callback: (data: Message) => void) {
		if (!this.callbacks.has(type)) {
			this.callbacks.set(type, callback);
		}
	}

	close(code?: number) {
		this.closed = true;
		this.socket.close(code);
	}
}

// lol this is dumb
function sleepSync(ms: number) {
	const end = new Date().getTime() + ms;
	console.warn(`sleeping ${ms}ms`);
	while (new Date().getTime() < end) {
		/* do nothing */
	}
}