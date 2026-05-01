import re
import os

ASYNC_FNS = [
    "createTask", "getTask", "listTasks", "listTasksSummary",
    "updateTaskStatus", "updateTaskTitle", "updateTaskMetadata", "deleteTask",
    "addAgentStep", "updateAgentStep", "addMessage",
    "addTaskFile", "listAllFiles", "getFilesStats", "updateFileFolder",
    "createFolder", "listFolders", "renameFolder", "deleteFolder",
    "addSubTask", "updateSubTask",
    "listSkills", "getSkill", "getSkillByName", "createSkill",
    "updateSkill", "deleteSkill", "incrementSkillUsage", "findSimilarSkill",
    "recordSkillPerf", "getSkillSuccessRateFromDb",
    "identifyUnderperformingSkillsFromDb", "listSkillPerformance",
    "updateMemoryAccess", "listMemoryWithMeta", "getSelfImprovementStats",
    "memoryStore", "memoryRecall", "listMemory", "deleteMemory", "updateMemory",
    "listGallery", "addGalleryItem", "deleteGalleryItem",
    "getConnectorConfig", "setConnectorConfig", "storeOAuthTokens",
    "disconnectConnector", "listConnectorConfigs",
    "trackTaskTokens", "getTaskTokenUsage", "getGlobalTokenUsage",
    "createScheduledTask", "listScheduledTasks", "getDueScheduledTasks",
    "updateScheduledTaskLastRun", "deleteScheduledTask", "toggleScheduledTask",
    "listTasksBySource", "getSetting", "setSetting", "getAllSettings",
    "getSystemHealth", "getBlockingTask",
    "recordLearning", "findSimilarLearnings", "updateLearningConfidence",
    "recordAnalyticsEvent", "getAnalyticsSummary",
    "getAuditLogs", "getAuditToolNames",
    "createSession", "getSessions", "getSession", "addTaskToSession",
    "updateSession", "deleteSession",
    "createDocument", "getDocument", "listDocuments", "updateDocument", "deleteDocument",
    "getUserSubscription", "createUserSubscription", "updateUserTier",
    "getUserByStripeCustomerId", "createGiftCode", "getGiftCode",
    "listGiftCodes", "redeemGiftCode", "isUserAdmin", "incrementTaskUsage",
    "checkTierFeature", "createUser", "getUserByEmail", "getUserById",
    "getUserCount", "updateUser",
    "getUserApiKeys", "setUserApiKey", "deleteUserApiKey", "getUserApiKeysRaw",
    "getSystemHealthLite",
]

FILES = [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/me/route.ts",
    "src/app/api/auth/register/route.ts",
    "src/app/api/computer-control/route.ts",
    "src/app/api/connectors/route.ts",
    "src/app/api/context/route.ts",
    "src/app/api/documents/[id]/ai/route.ts",
    "src/app/api/files/route.ts",
    "src/app/api/generate/route.ts",
    "src/app/api/gift-codes/redeem/route.ts",
    "src/app/api/hooks/route.ts",
    "src/app/api/scheduled-tasks/route.ts",
    "src/app/api/self-improvement/route.ts",
    "src/app/api/sessions/route.ts",
    "src/app/api/skills/[id]/route.ts",
    "src/app/api/stripe/checkout/route.ts",
    "src/app/api/stripe/portal/route.ts",
    "src/app/api/stripe/webhook/route.ts",
    "src/app/api/tasks/[taskId]/approve/route.ts",
    "src/app/api/tasks/[taskId]/message/route.ts",
    "src/app/api/tasks/[taskId]/run/route.ts",
    "src/app/api/tasks/[taskId]/stop/route.ts",
    "src/app/api/tasks/events/route.ts",
    "src/app/api/user/keys/route.ts",
    "src/app/api/user/subscription/route.ts",
    "src/app/api/whatsapp/route.ts",
    "src/app/computer/connectors/page.tsx",
    "src/app/computer/documents/[id]/page.tsx",
    "src/app/computer/documents/page.tsx",
    "src/app/computer/files/page.tsx",
    "src/app/computer/skills/page.tsx",
    "src/app/computer/tasks/[taskId]/page.tsx",
    "src/app/computer/tasks/page.tsx",
    "src/components/tier-gate.tsx",
    "src/lib/agent.ts",
    "src/lib/scheduler.ts",
]


def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    for fn in ASYNC_FNS:
        # Match the function name followed by ( but NOT preceded by "await " or identifier char
        pattern = r'(?<![a-zA-Z0-9_$])(' + re.escape(fn) + r')(\s*\()'

        def make_replacer(text):
            def replace_fn(m):
                start = m.start()
                # Look back up to 6 chars for "await "
                preceding = text[max(0, start-6):start]
                if preceding.endswith('await '):
                    return m.group(0)
                return 'await ' + m.group(1) + m.group(2)
            return replace_fn

        content = re.sub(pattern, make_replacer(content), content)

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False


changed = []
for f in FILES:
    if os.path.exists(f):
        if fix_file(f):
            changed.append(f)
    else:
        print(f"NOT FOUND: {f}")

print(f"Modified {len(changed)} files")
for f in changed:
    print(f"  {f}")
