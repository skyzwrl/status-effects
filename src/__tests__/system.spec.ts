/// <reference types="@rbxts/testez/globals" />

import { StatusSystem, defineStatus } from "..";

const Burn = defineStatus({ id: "Burn", duration: 3, tickInterval: 1 });

export = () => {
	describe("StatusSystem", () => {
		it("creates one container per target", () => {
			const system = new StatusSystem<string>();
			expect(system.find("a")).never.to.be.ok();
			expect(system.get("a")).to.equal(system.get("a"));
			expect(system.get("a")).never.to.equal(system.get("b"));
		});

		it("updates every container", () => {
			const system = new StatusSystem<string>();
			system.get("a").apply(Burn);
			system.get("b").apply(Burn);
			system.update(4);

			expect(system.get("a").has("Burn")).to.equal(false);
			expect(system.get("b").has("Burn")).to.equal(false);
		});

		it("releases a target and clears its effects", () => {
			const system = new StatusSystem<string>();
			const reasons = new Array<string>();
			system
				.get("a")
				.apply(defineStatus({ id: "Shield", duration: 10, onRemove: (_, reason) => reasons.push(reason) }));

			system.release("a");
			expect(reasons.join(",")).to.equal("cleared");
			expect(system.find("a")).never.to.be.ok();
		});

		it("keeps going when a callback releases or adds targets mid update", () => {
			const system = new StatusSystem<string>();
			const Spread = defineStatus({
				id: "Spread",
				duration: 2,
				tickInterval: 1,
				onTick: () => {
					system.release("b");
					system.get("c").apply(Burn);
				},
			});

			system.get("a").apply(Spread);
			system.get("b").apply(Burn);
			system.update(1);

			expect(system.find("b")).never.to.be.ok();
			expect(system.get("c").has("Burn")).to.equal(true);
		});

		it("ticks on Heartbeat once bound", () => {
			const system = new StatusSystem<string>();
			const container = system.get("a");
			const connection = system.bind();

			for (let frame = 0; frame < 30 && container.getTime() === 0; frame++) {
				task.wait();
			}
			connection.Disconnect();
			expect(container.getTime() > 0).to.equal(true);
		});
	});
};
