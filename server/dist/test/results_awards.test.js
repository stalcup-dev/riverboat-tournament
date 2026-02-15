import assert from "node:assert/strict";
import test from "node:test";
import { computeMatchResults } from "../src/results/awards.js";
test("computeMatchResults builds leaderboard sorted by score then name and champion achieved_server_ms uses match_end_ms", () => {
    const matchEndMs = 90_000;
    const results = computeMatchResults([
        {
            name: "Zagriban",
            score_total: 120,
            best_fish_weight: 4.2,
            best_fish_length: 55,
            best_fish_id: "river_trout",
            best_fish_achieved_ms: 41_000,
            species_caught_count: 3,
            species_count_achieved_ms: 42_000
        },
        {
            name: "Chrone",
            score_total: 120,
            best_fish_weight: 3.1,
            best_fish_length: 50,
            best_fish_id: "bluegill",
            best_fish_achieved_ms: 31_000,
            species_caught_count: 4,
            species_count_achieved_ms: 39_000
        },
        {
            name: "TankDaddy",
            score_total: 90,
            best_fish_weight: 9.5,
            best_fish_length: 88,
            best_fish_id: "northern_pike",
            best_fish_achieved_ms: 35_000,
            species_caught_count: 2,
            species_count_achieved_ms: 36_000
        }
    ], matchEndMs);
    assert.deepEqual(results.leaderboard, [
        { name: "Chrone", score_total: 120 },
        { name: "Zagriban", score_total: 120 },
        { name: "TankDaddy", score_total: 90 }
    ]);
    const championAward = results.awards.find((award) => award.title === "Champion");
    assert.equal(championAward?.winner_name, "Chrone");
    assert.equal(championAward?.achieved_server_ms, matchEndMs);
});
test("biggest fish tie uses earlier achieved_server_ms then name", () => {
    const results = computeMatchResults([
        {
            name: "Simpin",
            score_total: 130,
            best_fish_weight: 8.2,
            best_fish_length: 90,
            best_fish_id: "catfish",
            best_fish_achieved_ms: 23_000,
            species_caught_count: 4,
            species_count_achieved_ms: 50_000
        },
        {
            name: "TankDaddy",
            score_total: 100,
            best_fish_weight: 8.2,
            best_fish_length: 120,
            best_fish_id: "catfish",
            best_fish_achieved_ms: 20_000,
            species_caught_count: 4,
            species_count_achieved_ms: 48_000
        }
    ], 100_000);
    const biggestFishAward = results.awards.find((award) => award.title === "Biggest Fish");
    assert.equal(biggestFishAward?.winner_name, "TankDaddy");
    assert.equal(biggestFishAward?.achieved_server_ms, 20_000);
});
test("most species tie uses earlier achieved_server_ms then name", () => {
    const results = computeMatchResults([
        {
            name: "Reece",
            score_total: 90,
            best_fish_weight: 4.1,
            best_fish_length: 66,
            best_fish_id: "river_trout",
            best_fish_achieved_ms: 15_000,
            species_caught_count: 5,
            species_count_achieved_ms: 57_000
        },
        {
            name: "Hankey",
            score_total: 85,
            best_fish_weight: 4.9,
            best_fish_length: 69,
            best_fish_id: "river_trout",
            best_fish_achieved_ms: 19_000,
            species_caught_count: 5,
            species_count_achieved_ms: 54_000
        }
    ], 100_000);
    const mostSpeciesAward = results.awards.find((award) => award.title === "Most Species");
    assert.equal(mostSpeciesAward?.winner_name, "Hankey");
    assert.equal(mostSpeciesAward?.achieved_server_ms, 54_000);
});
