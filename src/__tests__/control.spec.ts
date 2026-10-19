/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

const Stun = defineStatus({ id: "Stun", duration: 4, diminishing: "stun", control: { stun: true }, tags: ["stun"] });

export = () => {
	describe("diminishing returns", () => {
		it("shortens each repeat inside the window, then stops applying", () => {
			const container = new StatusContainer("target");
			const durations = new Array<number>();

			for (let i = 0; i < 3; i++) {
				const result = container.apply(Stun);
				durations.push(result.effect!.duration);
				container.update(result.effect!.duration + 0.1);
			}

			expect(durations.join(",")).to.equal("4,2,1");
			expect(container.apply(Stun).status).to.equal("diminished");
		});

		it("goes back to full duration once the window has passed", () => {
			const container = new StatusContainer("target", { diminishingReset: 10 });
			container.apply(Stun);
			container.update(13.9);
			expect(container.apply(Stun).effect!.duration).to.equal(2);

			container.update(12.1);
			expect(container.apply(Stun).effect!.duration).to.equal(4);
		});

		it("starts the window when a stun is removed early", () => {
			const container = new StatusContainer("target", { diminishingReset: 10 });
			container.apply(Stun);
			container.update(1);
			container.removeById("Stun");

			container.update(10.1);
			expect(container.apply(Stun).effect!.duration).to.equal(4);
		});

		it("keeps the window open while another effect in the category is running", () => {
			const LongStun = defineStatus({ id: "LongStun", duration: 20, diminishing: "stun" });
			const container = new StatusContainer("target", { diminishingReset: 10 });
			container.apply(LongStun);
			container.apply(Stun);
			container.update(1);
			container.removeById("Stun");

			container.update(15);
			expect(container.apply(Stun).effect!.duration).to.equal(1);
		});

		it("tracks categories separately", () => {
			const Root = defineStatus({ id: "Root", duration: 4, diminishing: "root", control: { root: true } });
			const container = new StatusContainer("target");
			container.apply(Stun);
			expect(container.apply(Root).effect!.duration).to.equal(4);
		});

		it("uses custom levels", () => {
			const container = new StatusContainer("target", { diminishingLevels: [1, 0.75] });
			expect(container.apply(Stun).effect!.duration).to.equal(4);
			container.update(5);
			expect(container.apply(Stun).effect!.duration).to.equal(3);
			container.update(4);
			expect(container.apply(Stun).status).to.equal("diminished");
		});
	});

	describe("immunity", () => {
		it("blocks effects carrying an immune tag until it runs out", () => {
			const Daze = defineStatus({ id: "Daze", duration: 2, tags: ["stun", "cc"] });
			const container = new StatusContainer("target");
			container.grantImmunity("cc", 1);

			expect(container.apply(Daze).status).to.equal("immune");
			container.update(1.01);
			expect(container.apply(Daze).status).to.equal("applied");
		});

		it("grants immunity when an effect ends", () => {
			const Knockdown = defineStatus({
				id: "Knockdown",
				duration: 2,
				tags: ["knockdown"],
				immunityOnEnd: { tags: ["knockdown"], duration: 3 },
			});
			const container = new StatusContainer("target");
			container.apply(Knockdown);
			container.update(2.1);

			expect(container.isImmune("knockdown")).to.equal(true);
			expect(container.apply(Knockdown).status).to.equal("immune");
			container.update(3);
			expect(container.apply(Knockdown).status).to.equal("applied");
		});

		it("blocks a reapply from inside the removal callbacks", () => {
			const container = new StatusContainer("target");
			let reapplied = "";
			const Freeze = defineStatus({
				id: "Freeze",
				duration: 1,
				tags: ["freeze"],
				immunityOnEnd: { tags: ["freeze"], duration: 2 },
				onExpire: () => {
					reapplied = container.apply(Freeze).status;
				},
			});

			container.apply(Freeze);
			container.update(1.5);
			expect(reapplied).to.equal("immune");
		});

		it("doesn't grant immunity when a stronger version replaces the effect", () => {
			const Hex = defineStatus({
				id: "Hex",
				duration: 5,
				tags: ["hex"],
				stacking: { kind: "strongest" },
				immunityOnEnd: { tags: ["hex"], duration: 5 },
			});
			const container = new StatusContainer("target");
			container.apply(Hex, { strength: 1 });
			container.apply(Hex, { strength: 2 });
			expect(container.isImmune("hex")).to.equal(false);
		});

		it("can be permanent and revoked", () => {
			const container = new StatusContainer("target");
			container.grantImmunity("stun");
			container.update(1000);
			expect(container.apply(Stun).status).to.equal("immune");

			container.revokeImmunity("stun");
			expect(container.apply(Stun).status).to.equal("applied");
		});
	});

	describe("crowd control", () => {
		it("reports stuns, roots and silences while they last", () => {
			const Silence = defineStatus({ id: "Silence", duration: 2, control: { silence: true } });
			const Snare = defineStatus({ id: "Snare", duration: 3, control: { root: true } });
			const container = new StatusContainer("target");
			container.apply(Silence);
			container.apply(Snare);

			expect(container.hasControl("silence")).to.equal(true);
			expect(container.hasControl("root")).to.equal(true);
			expect(container.hasControl("stun")).to.equal(false);
			expect(container.getMoveSpeedMultiplier()).to.equal(0);

			container.update(2.5);
			expect(container.hasControl("silence")).to.equal(false);
			expect(container.hasControl("root")).to.equal(true);
			container.update(1);
			expect(container.getMoveSpeedMultiplier()).to.equal(1);
		});

		it("uses the strongest slow by default", () => {
			const container = new StatusContainer("target");
			container.apply(defineStatus({ id: "Chill", duration: 5, control: { slow: 0.3 } }));
			container.apply(defineStatus({ id: "Frost", duration: 5, control: { slow: 0.5 } }));

			expect(container.getSlow()).to.be.near(0.5);
			expect(container.getMoveSpeedMultiplier()).to.be.near(0.5);
		});

		it("can combine slows multiplicatively", () => {
			const container = new StatusContainer("target", { slowStacking: "multiplicative" });
			container.apply(defineStatus({ id: "Chill", duration: 5, control: { slow: 0.3 } }));
			container.apply(defineStatus({ id: "Frost", duration: 5, control: { slow: 0.5 } }));

			expect(container.getSlow()).to.be.near(0.65);
		});

		it("scales a stacking slow by its stacks, capped at a full stop", () => {
			const Tar = defineStatus({
				id: "Tar",
				duration: 5,
				stacking: { kind: "stack", maxStacks: 6 },
				control: { slow: 0.2 },
			});
			const container = new StatusContainer("target");
			container.apply(Tar, { stacks: 3 });
			expect(container.getSlow()).to.be.near(0.6);

			container.apply(Tar, { stacks: 3 });
			expect(container.getSlow()).to.equal(1);
		});

		it("stops movement while stunned", () => {
			const container = new StatusContainer("target");
			container.apply(Stun);
			expect(container.getMoveSpeedMultiplier()).to.equal(0);
		});
	});
};
