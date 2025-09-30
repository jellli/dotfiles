local async = require("async")
local uv = vim.uv
local asystem = async.wrap(3, vim.system)

local M = {}

--- Get the package.json version
--- @return string | nil version
function M.get_package_json_version()
  local cwd = uv.cwd()
  local path = cwd .. "/package.json"
  local stat = uv.fs_stat(path)
  if stat and stat.type == "file" then
  else
    vim.notify("No package.json found", vim.log.levels.ERROR, { title = "Deploy" })
    return
  end
  --- @type vim.SystemCompleted
  ---@diagnostic disable-next-line: assign-type-mismatch
  local version_res = asystem({ "jq", "-r", ".version", path })
  if version_res.code == 0 then
    return version_res.stdout
  end
end

--- Get the next release branch name
---@param opts { type: "release" | "hotfix" }
---@return string next release branch name
function M.get_next_release_branch_name(opts)
  local prefix = opts.type .. "/" .. os.date("%Y%m%d") .. "-"
  local branch_name
  local latest_number = 0
  --- @type vim.SystemCompleted
  ---@diagnostic disable-next-line: assign-type-mismatch
  local res = asystem(
    { "git", "for-each-ref", "--format=%(refname:short)", "refs/heads/" .. prefix .. "*" },
    { text = true }
  )
  local lines = vim.split(res.stdout or "", "\n")
  for _, line in ipairs(lines) do
    local number_str = line:match("-(%d+)")
    if number_str ~= nil then
      local current_number = tonumber(number_str)
      if current_number and current_number > latest_number then
        latest_number = current_number
      end
    end
  end
  branch_name = prefix .. (latest_number + 1)
  return branch_name
end

--- generates a deploy branch name
--- @param opts { type: "release" | "hotfix", should_fetch: boolean }
---@return  nil
function M.prepare_release(opts)
  async
    .run(function()
      local version = M.get_package_json_version()
      if not version then
        return
      end
      print("Current version: " .. version)

      asystem({ "git", "switch", "master" })
      if opts.should_fetch then
        asystem({ "git", "pull" })
        asystem({ "git", "fetch", "--prune" })
      end

      local branch_name = M.get_next_release_branch_name(opts)
      asystem({ "git", "switch", "-c", branch_name })

      local input = ""
      local semver_pattern = [[\v^(\d+)\.(\d+)\.(\d+)(-(\S+))?(\+(\S+))?$]]
      while not input:match(semver_pattern) do
        async.await(3, vim.ui.input, {
          prompt = "Next version (current: " .. version .. "): ",
          default = " " .. version,
        }, function(str)
          input = str
        end)
      end
      print("Deploying " .. input)
    end)
    :raise_on_error()
end

return M
