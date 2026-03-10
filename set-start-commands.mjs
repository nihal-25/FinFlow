// Set clean start commands — patches.ts handles module resolution after fresh build
const TOKEN = "2c82581a-306c-4b36-9a3a-2470f8005ef3";
const ENV_ID = "e479c452-7de1-4d3b-9ce8-a35549c34bff";

const services = [
  { id: "64fab52c-2ece-4deb-bbb7-9aaaecdcd079", name: "api-gateway",          cmd: "node /app/apps/api-gateway/dist/server.js" },
  { id: "26e6a48c-af4a-4ba2-be28-32a4569f5bbe", name: "transaction-service",  cmd: "node /app/apps/transaction-service/dist/server.js" },
  { id: "479c2b1f-0deb-474e-990d-41cb5cc2d615", name: "fraud-service",        cmd: "node /app/apps/fraud-service/dist/server.js" },
  { id: "26260341-1ff4-4f48-ae79-90f2119d6b4e", name: "notification-service", cmd: "node /app/apps/notification-service/dist/server.js" },
  { id: "d923729c-efb0-4579-a1e3-d998a5439d21", name: "analytics-service",    cmd: "node /app/apps/analytics-service/dist/server.js" },
];

for (const svc of services) {
  const body = JSON.stringify({
    query: `mutation($svcId:String!,$envId:String!,$cmd:String!){serviceInstanceUpdate(serviceId:$svcId,environmentId:$envId,input:{startCommand:$cmd})}`,
    variables: { svcId: svc.id, envId: ENV_ID, cmd: svc.cmd },
  });
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body,
  });
  const json = await res.json();
  console.log(`${svc.name}: ${svc.cmd} →`, JSON.stringify(json));
}
