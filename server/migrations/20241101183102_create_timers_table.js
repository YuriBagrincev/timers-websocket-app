exports.up = function (knex) {
  return knex.schema.createTable("timers", (table) => {
    table.increments("id").primary();
    table.string("description");
    table.timestamp("start").defaultTo(knex.fn.now());
    table.timestamp("end");
    table.integer("duration");
    table.boolean("isActive").defaultTo(true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("timers");
};
