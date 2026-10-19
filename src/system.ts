import { RunService } from "@rbxts/services";
import { StatusContainer } from "./container";
import { ContainerOptions } from "./types";

export class StatusSystem<T> {
	private readonly containers = new Map<T, StatusContainer<T>>();
	// separate list so update can iterate while callbacks add or release targets
	private list = new Array<StatusContainer<T>>();

	public constructor(private readonly options: ContainerOptions = {}) {}

	public get(target: T): StatusContainer<T> {
		let container = this.containers.get(target);
		if (container === undefined) {
			container = new StatusContainer(target, this.options);
			this.containers.set(target, container);
			this.list = [...this.list, container];
		}
		return container;
	}

	public find(target: T): StatusContainer<T> | undefined {
		return this.containers.get(target);
	}

	public release(target: T): void {
		const container = this.containers.get(target);
		if (container !== undefined) {
			this.containers.delete(target);
			this.list = this.list.filter((other) => other !== container);
			container.destroy();
		}
	}

	public update(deltaTime: number): void {
		for (const container of this.list) {
			container.update(deltaTime);
		}
	}

	public bind(event: RBXScriptSignal<(deltaTime: number) => void> = RunService.Heartbeat): RBXScriptConnection {
		return event.Connect((deltaTime) => this.update(deltaTime));
	}
}
