var aws = require("aws-lib"),
    _ = require("underscore"),
    argv = require('optimist').argv,
    fs = require('fs'),
    sh = require('sh');

if (!argv.config) {
    console.log("Must provide --config argument which points to json settings file, such as --config settings.json");
    process.exit(1);
}

var options = {};
try {
    var config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
    for (var key in config) {
        options[key] = config[key];
    }
} catch(e) {
   console.warn('Invalid JSON config file: ' + options.config);
   throw e;
}

if (!options.awskey ||
    !options.awssecret) {
    console.log("Must provide all of awskey, awssecret, pool, description, and volume as --config parameters")
    process.exit(1);
}

// version 2010-08-31 supports the 'Filter' parameter.
ec2 = aws.createEC2Client(options.awskey, options.awssecret, {version: '2010-08-31'});

var jobs = options.jobs;

function run(selfInstanceId, selfInstanceAz) {
    _.each(jobs, function(job, key) {
        var id = key == 'self' ? selfInstanceId : key;
        var devices = job.devices.split(/\s*,\s*/);
        _.each(devices, function(device) {
            var description = job.description + ' ' + device + ' ' + id;
            var params = {};
            params['Owner'] = 'self';
            params['Filter.1.Name'] = 'description';
            params['Filter.1.Value.1'] = description;
            // Find each snapshot
            ec2.call('DescribeSnapshots', params, function(result) {
                var snapshot = result.snapshotSet.item.snapshotId;
                // Create a volume in the instance's same availability zone.
                ec2.call('CreateVolume', {Size: job.size, SnapshotId: snapshot, AvailabilityZone: selfInstanceAz}, function(result) {
                    // Attach to the instance
                    ec2.call('AttachVolume', {VolumeId: result.volumeId, InstanceId: selfInstanceId, Device: device}, function(result) {
                        
                    });
                });
            });
        });
    });
}

function getInstanceId(cb) {
    sh('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id').result(function(id) {
        cb(id);
    });
}

function getInstanceAz(cb) {
    sh('wget -q -O - http://169.254.169.254/latest/meta-data/placement/availability-zone').result(function(id) {
        cb(id);
    });
}

getInstanceId(function(instanceId) {
    getInstanceAz(function(instanceAz) {
        run(instanceId, instanceAz);
    });
});
