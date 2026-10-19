/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

function tracked(order: string[], duration?: number) {
	return defineStatus({
		id: "Tracked",
		duration,
		tags: ["magic"],
		onApply: () => order.push("apply"),
		onExpire: () => order.push("expire"),
		onRemove: (_, reason) => order.push(`remove:${reason}`),
	});
}

function listen(container: StatusContainer<string>, order: string[]) {
	container.onApplied(() => order.push("listener:applied"));
	container.onRemoved((_, reason) => order.push(`listener:removed:${reason}`));
}

export = () => {
	describe("callback order", () => {
		it("runs onExpire, then onRemove, then listeners when an effect runs out", () => {
			const order = new Array<string>();
			const container = new StatusContainer("target");
			listen(container, order);

			container.apply(tracked(order, 1));
			container.update(1.5);

			expect(order.join(",")).to.equal("apply,listener:applied,expire,remove:expired,listener:removed:expired");
		});

		it("skips onExpire when an effect is removed early", () => {
			const order = new Array<string>();
			const container = new StatusContainer("target");
			const effect = container.apply(tracked(order, 10)).effect!;
			listen(container, order);

			expect(container.remove(effect)).to.equal(true);
			expect(container.remove(effect)).to.equal(false);
			expect(order.join(",")).to.equal("apply,remove:removed,listener:removed:removed");
		});

		it("lets onExpire apply a follow-up effect", () => {
			const container = new StatusContainer("target");
			const Dazed = defineStatus({ id: "Dazed", duration: 2 });
			const Charge = defineStatus({ id: "Charge", duration: 1, onExpire: () => container.apply(Dazed) });

			container.apply(Charge);
			container.update(1.5);

			expect(container.has("Charge")).to.equal(false);
			expect(container.get("Dazed")!.getRemaining()).to.be.near(1.5);
		});
	});

	describe("removal", () => {
		it("cleanses every effect carrying a tag", () => {
			const container = new StatusContainer("target");
			const reasons = new Array<string>();
			container.onRemoved((effect, reason) => reasons.push(`${effect.id}:${reason}`));

			container.apply(defineStatus({ id: "Burn", duration: 5, tags: ["fire", "dot"] }));
			container.apply(defineStatus({ id: "Chill", duration: 5, tags: ["ice"] }));
			container.apply(defineStatus({ id: "Ignite", duration: 5, tags: ["fire"] }));

			expect(container.cleanse("fire")).to.equal(2);
			expect(container.cleanse("fire")).to.equal(0);
			expect(container.has("Chill")).to.equal(true);
			expect(reasons.join(",")).to.equal("Burn:cleansed,Ignite:cleansed");
		});

		it("removes every instance of an id", () => {
			const Mark = defineStatus({ id: "Mark", duration: 5, stacking: { kind: "independent" } });
			const container = new StatusContainer("target");
			container.apply(Mark);
			container.apply(Mark);

			expect(container.removeById("Mark")).to.equal(2);
			expect(container.has("Mark")).to.equal(false);
		});

		it("clears everything and refuses new effects after destroy", () => {
			const order = new Array<string>();
			const container = new StatusContainer("target");
			container.apply(tracked(order, 10));
			container.destroy();

			expect(order.join(",")).to.equal("apply,remove:cleared");
			expect(() => container.apply(tracked(order))).to.throw("destroyed");
		});
	});

	describe("listeners", () => {
		it("reports refreshes", () => {
			const container = new StatusContainer("target");
			let refreshes = 0;
			container.onRefreshed(() => refreshes++);

			const Haste = defineStatus({ id: "Haste", duration: 4 });
			container.apply(Haste);
			container.apply(Haste);
			expect(refreshes).to.equal(1);
		});

		it("stops calling a listener once it disconnects", () => {
			const container = new StatusContainer("target");
			let applied = 0;
			const disconnect = container.onApplied(() => applied++);

			container.apply(defineStatus({ id: "A", duration: 1 }));
			disconnect();
			container.apply(defineStatus({ id: "B", duration: 1 }));
			expect(applied).to.equal(1);
		});
	});

	describe("remaining time", () => {
		it("counts down with updates and never goes negative", () => {
			const container = new StatusContainer("target");
			const effect = container.apply(defineStatus({ id: "Haste", duration: 4 })).effect!;

			container.update(1.5);
			expect(effect.getRemaining()).to.be.near(2.5);
			container.update(10);
			expect(effect.getRemaining()).to.equal(0);
			expect(effect.active).to.equal(false);
		});

		it("is infinite for effects without a duration", () => {
			const container = new StatusContainer("target");
			const effect = container.apply(defineStatus({ id: "Aura" })).effect!;
			container.update(1e6);
			expect(effect.getRemaining()).to.equal(math.huge);
		});

		it("accepts a per application duration", () => {
			const container = new StatusContainer("target");
			const effect = container.apply(defineStatus({ id: "Haste", duration: 4 }), { duration: 9 }).effect!;
			expect(effect.duration).to.equal(9);
		});
	});
};
