import { describe, expect, it } from "vitest";
import { Executer } from "../../src/MessageService/context/executer";
import { ToolRegistry } from "../../src/Tools/ToolRegistry";
import { UpsertScheduledTaskTool } from "../../src/Tools/upsertScheduledTaskTool";
import { FakeLlmProvider } from "../fakes/FakeLlmProvider";
import { FakeSqlManager } from "../fakes/FakeSqlManager";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import {
    ConversationEvent,
    ConversationState,
    ResponseIntent,
    StateMachineInput
} from "../../src/dataClients/Types/stateMachineTypes";

function createCache(state: ConversationState, schedulingAttempts?: number): ConversationCacheState {
    return {
        conversationId: 42,
        state,
        channel: CommunicationChannel.Whatsapp,
        provider: MessageProvider.Twilio,
        collectedParams: { Name: "Dana", service: "consulting" },
        lastMessages: [],
        updatedAt: new Date(),
        phone: "+972521234567",
        schedulingAttempts
    };
}

function createInput(cache: ConversationCacheState): StateMachineInput {
    return {
        currentState: cache.state,
        messageContent: "sure, tomorrow at 10 works",
        collectedParams: cache.collectedParams,
        lastMessages: cache.lastMessages,
        businessContext: null,
        schedulingEnabled: true
    };
}

function createSchedulingSetup(sql: FakeSqlManager, llm: FakeLlmProvider) {
    const registry = new ToolRegistry();
    registry.register(new UpsertScheduledTaskTool(sql));
    return new Executer(llm, undefined, registry);
}

describe("Executer scheduling confirmation", () => {
    it("creates the callback task and an activity event when the user agrees with a time", async () => {
        const sql = new FakeSqlManager();
        const llm = new FakeLlmProvider({
            events: [{
                conversationEvent: ConversationEvent.schedulingAgreed,
                newConclusion: "User agreed to callback",
                scheduledTime: "2026-07-28T10:00:00.000Z"
            }],
            responses: ["Great, we'll call you Tuesday at 10!"]
        });
        const executer = createSchedulingSetup(sql, llm);
        const cache = createCache(ConversationState.scheduling, 1);

        const result = await executer.prepareAndExecute(createInput(cache), cache, { businessId: 7, clientId: 3 });

        expect(result.response).toBe("Great, we'll call you Tuesday at 10!");
        expect(cache.state).toBe(ConversationState.closing);
        expect(cache.scheduledTaskId).toBeDefined();
        const saved = sql.aiScheduledTasks.get("7:3");
        expect(saved?.scheduledFor.toISOString()).toBe("2026-07-28T10:00:00.000Z");
        expect(sql.activityEvents).toEqual([
            expect.objectContaining({ businessId: 7, aggregateType: "TASK", eventType: "TASK_CREATED" })
        ]);
        expect(llm.responseInputs[0].output.responseIntent).toBe(ResponseIntent.confirmSchedule);
    });

    it("reschedules the same task when the client changes the time", async () => {
        const sql = new FakeSqlManager();
        const llm = new FakeLlmProvider({
            events: [
                {
                    conversationEvent: ConversationEvent.schedulingAgreed,
                    newConclusion: "agreed",
                    scheduledTime: "2026-07-28T10:00:00.000Z"
                },
                {
                    conversationEvent: ConversationEvent.schedulingAgreed,
                    newConclusion: "changed time",
                    scheduledTime: "2026-07-29T16:00:00.000Z"
                }
            ],
            responses: ["confirmed", "updated"]
        });
        const executer = createSchedulingSetup(sql, llm);

        const firstCache = createCache(ConversationState.scheduling, 1);
        await executer.prepareAndExecute(createInput(firstCache), firstCache, { businessId: 7, clientId: 3 });

        // Same client, a later conversation in closing: late agreement path.
        const secondCache = createCache(ConversationState.closing);
        await executer.prepareAndExecute(createInput(secondCache), secondCache, { businessId: 7, clientId: 3 });

        const saved = sql.aiScheduledTasks.get("7:3");
        expect(saved?.updates).toBe(1);
        expect(saved?.scheduledFor.toISOString()).toBe("2026-07-29T16:00:00.000Z");
        expect(sql.activityEvents.map((event) => event.eventType)).toEqual(["TASK_CREATED", "TASK_UPDATED"]);
    });

    it("drops an invalid scheduled time and keeps negotiating instead of confirming", async () => {
        const sql = new FakeSqlManager();
        const llm = new FakeLlmProvider({
            events: [{
                conversationEvent: ConversationEvent.schedulingAgreed,
                newConclusion: "agreed vaguely",
                scheduledTime: "tomorrow afternoon"
            }],
            responses: ["What time works best for you?"]
        });
        const executer = createSchedulingSetup(sql, llm);
        const cache = createCache(ConversationState.scheduling, 1);

        await executer.prepareAndExecute(createInput(cache), cache, { businessId: 7, clientId: 3 });

        expect(cache.state).toBe(ConversationState.scheduling);
        expect(sql.aiScheduledTasks.size).toBe(0);
        expect(llm.responseInputs[0].output.responseIntent).toBe(ResponseIntent.proposeSchedule);
    });
});
