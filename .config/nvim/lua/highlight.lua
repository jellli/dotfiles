local M = { ns = nil }
M.cache = {}
M.get_pseudonym = function(hl)
  local name = "j"
  local keys = vim.tbl_keys(hl)
  table.sort(keys)
  for _, arg in ipairs(keys) do
    local val = hl[arg]
    name = ("%s__%s_%s"):format(name, arg, tostring(val):gsub("[^%w]", ""):lower())
  end
  return name
end

function M.register(hl, group_name)
  hl = type(hl) == "string" and { group = hl } or hl
  group_name = group_name or M.get_pseudonym(hl)
  local cmd = {
    lhs = { "highlight" },
    rhs = {},
  }
  for key, value in pairs(hl) do
    if key == "group" then
      table.insert(cmd.lhs, "link")
      table.insert(cmd.rhs, value)
    else
      table.insert(cmd.rhs, ("%s=%s"):format(key, value))
    end
  end
  table.insert(cmd.lhs, group_name)

  local cmd_str = table.concat(cmd.lhs, " ") .. " " .. table.concat(cmd.rhs, " ")
  if not M.cache[group_name] or M.cache[group_name] ~= cmd_str then
    M.cache[group_name] = cmd_str
    vim.cmd(cmd_str)
  end
  return group_name
end

function M.setup()
  M.ns = vim.api.nvim_create_namespace("JL")
end

M.setup()

local call_stack = {}
function M.render(input)
  if type(input) ~= "table" then
    return input
  end
  local content = {}
  for index, value in ipairs(input) do
  end
end
--
-- return M

-- local example_render_table = {
--   " ",
--   filename,
--   modified and { " *", guifg = "#888888", gui = "bold" } or "",
--   " ",
--   guibg = "#111111",
--   guifg = "#eeeeee",
-- }

local test_1 = {
  "foo",
  "/bar.lua",
  guibg = "#111111",
  guifg = "#eeeeee",
}
local expect_1 = {
  text = "foo/bar.lua",
  hl = {
    guibg = test_1.guibg,
    guifg = test_1.guifg,
  },
}
local example_render_table = {
  "foo",
  "dump.lua",
  { " *", guifg = "#888888", gui = "bold" },
  "bar",
  guibg = "#ff0000",
  guifg = "#eeeeee",
}

function M.parse(input, offset)
  offset = offset or 0
  local content = {
    text = "",
    hl = {},
    children = {},
    range = { offset, offset },
  }
  for key, value in pairs(input) do
    if type(key) == "string" then
      content.hl[key] = value
    elseif type(value) == "string" then
      content.text = content.text .. value
      content.range[2] = offset + #content.text
    elseif type(value) == "table" then
      local inner_context = M.parse(value, offset + #content.text)
      content.text = content.text .. inner_context.text
      content.range[2] = offset + #content.text
      table.insert(content.children, inner_context)
    end
  end
  content.range[2] = offset + #content.text

  return content
end

local buf = 507
function M.render_1(input, line)
  for index, content in ipairs(input) do
    line = line or index - 1
    vim.api.nvim_buf_set_lines(buf, line, line, false, { content.text })
    vim.api.nvim_buf_set_extmark(buf, M.ns, line, content.range[1], {
      hl_group = M.register(content.hl),
      end_col = content.range[2],
    })
    for _, child in ipairs(content.children) do
      M.render_1(child, line + 1)
    end
  end
end

vim.print(vim.inspect(M.parse(example_render_table)))
M.render_1({ M.parse(example_render_table) })
