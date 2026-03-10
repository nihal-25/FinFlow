const token = '2c82581a-306c-4b36-9a3a-2470f8005ef3';
const projectId = '0df66a75-98de-4ab9-a182-4619152ec3d9';

const res = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
  body: JSON.stringify({ query: `{
    project(id: "${projectId}") {
      services {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  domains {
                    serviceDomains { domain }
                    customDomains { domain }
                  }
                }
              }
            }
          }
        }
      }
    }
  }` })
});
const data = await res.json();
const services = data.data?.project?.services?.edges || [];
for (const e of services) {
  const s = e.node;
  const instances = s.serviceInstances?.edges || [];
  for (const ie of instances) {
    const domains = ie.node?.domains;
    const sd = domains?.serviceDomains?.map(d => d.domain) || [];
    const cd = domains?.customDomains?.map(d => d.domain) || [];
    if (sd.length || cd.length) {
      console.log(s.name, '→', [...sd, ...cd].join(', '));
    }
  }
}
