// Get all service info from Railway
const token = '2c82581a-306c-4b36-9a3a-2470f8005ef3';
const envId = 'e479c452-7de1-4d3b-9ce8-a35549c34bff';

const res = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
  body: JSON.stringify({ query: `{
    environment(id: "${envId}") {
      serviceInstances {
        edges {
          node {
            serviceId
            service { name }
          }
        }
      }
    }
  }` })
});
const data = await res.json();
const instances = data.data?.environment?.serviceInstances?.edges || [];
for (const e of instances) {
  const n = e.node;
  console.log(n.service?.name, '→', n.serviceId);
}
