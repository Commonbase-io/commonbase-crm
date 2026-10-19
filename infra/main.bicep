// Draft only. Do not deploy this file from CI. Hosting, region, and cost are still open.
// It sketches Azure Container Apps plus PostgreSQL Flexible Server for a later decision.

@description('Azure region.')
param location string = resourceGroup().location

@description('Short name used on resource names.')
param name string = 'commonbasecrm'

@description('Container image, supplied at deploy time. Not set in git.')
param image string

@secure()
@description('Migrator password. Supply at deploy time. Do not commit a value.')
param postgresAdminPassword string

var logName = '${name}-logs'
var envName = '${name}-env'
var appName = '${name}-app'
var pgName = '${name}-pg'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: pgName
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: 'crm_migrator'
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'crm'
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000 }
      secrets: [
        { name: 'database-url' }
      ]
    }
    template: {
      containers: [
        {
          name: 'crm'
          image: image
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

output appFqdn string = app.properties.configuration.ingress.fqdn
output postgresHost string = postgres.properties.fullyQualifiedDomainName
