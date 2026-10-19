interface Entry<A extends unknown[]> {
	readonly callback: (...args: A) => void;
	connected: boolean;
}

export class Listeners<A extends unknown[]> {
	private entries = new Array<Entry<A>>();

	public connect(callback: (...args: A) => void): () => void {
		const entry: Entry<A> = { callback, connected: true };
		// copy on write, so a fire in progress keeps iterating the list it started with
		this.entries = [...this.entries, entry];

		return () => {
			if (entry.connected) {
				entry.connected = false;
				this.entries = this.entries.filter((other) => other !== entry);
			}
		};
	}

	public fire(...args: A): void {
		// listeners are observers (ui, sounds), each gets its own thread so one erroring or
		// yielding can't stall the container mid update
		for (const entry of this.entries) {
			if (entry.connected) {
				task.spawn(entry.callback, ...args);
			}
		}
	}

	public clear(): void {
		for (const entry of this.entries) {
			entry.connected = false;
		}
		this.entries = [];
	}
}
