// Create GitHub repo triggers AND update start commands for all services
const TOKEN = "2c82581a-306c-4b36-9a3a-2470f8005ef3";
const ENV_ID = "e479c452-7de1-4d3b-9ce8-a35549c34bff";
const PROJECT_ID = "0df66a75-98de-4ab9-a182-4619152ec3d9";
const REPO = "nihal-25/FinFlow";
const BRANCH = "main";

const services = [
  { id: "64fab52c-2ece-4deb-bbb7-9aaaecdcd079", name: "api-gateway" },
  { id: "26e6a48c-af4a-4ba2-be28-32a4569f5bbe", name: "transaction-service" },
  { id: "479c2b1f-0deb-474e-990d-41cb5cc2d615", name: "fraud-service" },
  { id: "26260341-1ff4-4f48-ae79-90f2119d6b4e", name: "notification-service" },
  { id: "d923729c-efb0-4579-a1e3-d998a5439d21", name: "analytics-service" },
];

async function gql(query, variables = {}) {
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Step 1: Create repo triggers for each service
console.log("=== Creating repo triggers ===");
for (const svc of services) {
  const result = await gql(
    `mutation($input: DeploymentTriggerCreateInput!) { deploymentTriggerCreate(input: $input) { id } }`,
    {
      input: {
        branch: BRANCH,
        provider: "github",
        repository: REPO,
        environmentId: ENV_ID,
        projectId: PROJECT_ID,
        serviceId: svc.id,
      }
    }
  );
  console.log(`${svc.name}:`, JSON.stringify(result));
}

// Step 2: Update start commands to use start.js
console.log("\n=== Updating start commands to use start.js ===");
for (const svc of services) {
  const cmd = `node /app/apps/${svc.name}/dist/start.js`;
  const result = await gql(
    `mutation($svcId:String!,$envId:String!,$cmd:String!){serviceInstanceUpdate(serviceId:$svcId,environmentId:$envId,input:{startCommand:$cmd})}`,
    { svcId: svc.id, envId: ENV_ID, cmd }
  );
  console.log(`${svc.name} (${cmd}):`, JSON.stringify(result));
}
