import { describe, expect, it } from "bun:test";
import { buildFormCsv } from "./api.ts";

describe("buildFormCsv", () => {
	it("quotes values and guards spreadsheet formulas", () => {
		const csv = buildFormCsv(
			{
				title: "Feedback",
				fields: [
					{
						id: "name",
						title: "Name",
						type: "short_text",
						required: false,
						description: "",
						options: [],
					},
					{
						id: "idea",
						title: "Idea",
						type: "short_text",
						required: false,
						description: "",
						options: [],
					},
				],
			},
			[
				{
					id: "response-1",
					submittedAt: "2026-09-25T00:00:00.000Z",
					answers: { name: 'A" B', idea: "=1+1" },
				},
			]
		);
		expect(csv).toBe(
			'"Submitted at","Name","Idea"\r\n"2026-09-25T00:00:00.000Z","A"" B","\'=1+1"'
		);
	});
});
