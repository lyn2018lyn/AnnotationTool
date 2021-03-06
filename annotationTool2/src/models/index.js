let mongoose = require('mongoose');
let config = require('../config');
let _ = require('lodash');
let assert = require('assert');

mongoose.Promise = global.Promise;

exports.Dataset = require('./dataset');
exports.DatasetItem = require('./dataset_item');
let Task = exports.Task = require('./task');
let TaskItem = exports.TaskItem = require('./task_item');

async function buildID () {
    for (let skip = 0; ; skip++) {
        let task = await Task.findOne({}).skip(skip);
        if (!task) break;

        if (!task.tag_splits || !_.isArray(task.tag_splits) || _.sumBy(task.tag_splits, s => s.size) !== task.tags.length || _.some(task.tag_splits, s => !_.isNumber(s.start))) {
            task.tag_splits = [{
                title: '默认分栏',
                start: 0,
                size: task.tags.length
            }];
            await task.save();
        }
    }

    // await TaskItem.collection.update({}, {$unset: {pos: 1 }}, {multi: true});
    while (true) {
        let item = await TaskItem.findOne({by_human: true, pos: {$exists: false}});
        if (!item) break;
        let count = await TaskItem.countDocuments({task: item.task, by_human: true, pos: {$exists: true}});
        if (count > 0) {
            let max_id = (await TaskItem.findOne({task: item.task, by_human: true, pos: {$exists: true}}).sort('-pos')).pos;
            item.pos = max_id + 1;
        } else {
            item.pos = 1;
        }
        console.log(item.pos);
        await item.save();
    }

    for (let skip = 0; ;skip++) {
        let item = await TaskItem.findOne({ 'relation_tags.0': { '$exists': true } }).skip(skip).populate('task');
        if (!item) break;

        let modified = false;
        for (let r of item.relation_tags) {
            if (!r.relation_type) {
                r.relation_type = 'one2one';
                r.relation_type_text = '一对一';
                modified = true;
            }
            if (!_.isArray(r.entity1)) {
                r.entity1 = [r.entity1];
                modified = true;
            }
            if (!_.isArray(r.entity2)) {
                r.entity2 = [r.entity2];
                modified = true;
            }
        }
        if (modified) {
            item.markModified('relation_tags');
            await item.save();
        }
    }

    for (let skip = 0; ; skip++) {
        let item = await TaskItem.findOne().skip(skip).populate('dataset_item');
        if (!item) break;

        let start = 0;
        let modified = false;
        item.tags = item.tags.filter(t => t.length > 0);
        for (let t of item.tags) {
            if (!t.text) {
                t.text = item.dataset_item.content.slice(start, start + t.length);
                assert(t.text.length === t.length);
                modified = true;
            }
            start += t.length;
        }
        assert(start === item.dataset_item.content.length);
        if (modified) {
            item.markModified('tags');
            await item.save();
        }
    }

    console.log('rebuild db success');
}

mongoose.connect(config.MONGODB_URL, {
    useNewUrlParser: true
}, function (err) {
    if (err) {
        console.error('connect to %s error: ', config.MONGODB_URL, err.message);
        process.exit(1);
    } else {
        buildID();
    }
});
