// Type declarations for optional cloud provider SDKs
// These modules are dynamically imported and may not be installed

declare module '@aws-sdk/client-ec2' {
  export class EC2Client {
    constructor(config: any);
    send(command: any): Promise<any>;
  }
  export class DescribeInstancesCommand {
    constructor(input: any);
  }
}

declare module '@google-cloud/compute' {
  export class InstancesClient {
    constructor(config?: any);
    aggregatedList(request: any): Promise<any>;
  }
}

declare module '@azure/arm-compute' {
  export class ComputeManagementClient {
    constructor(credential: any, subscriptionId: string);
    virtualMachines: {
      listAll(): AsyncIterable<any>;
      instanceView(resourceGroup: string, name: string): Promise<any>;
    };
  }
}

declare module '@azure/arm-network' {
  export class NetworkManagementClient {
    constructor(credential: any, subscriptionId: string);
    networkInterfaces: {
      get(resourceGroup: string, name: string): Promise<any>;
    };
    publicIPAddresses: {
      get(resourceGroup: string, name: string): Promise<any>;
    };
  }
}

declare module '@azure/identity' {
  export class ClientSecretCredential {
    constructor(tenantId: string, clientId: string, clientSecret: string);
  }
}
