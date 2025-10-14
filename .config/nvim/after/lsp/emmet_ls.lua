return {
  init_options = {
    jsx = {
      options = {
        ["jsx.enabled"] = true,
        ["markup.attributes"] = {
          ["class"] = "className",
          ["class*"] = "className",
          ["for"] = "htmlFor",
        },
        ["markup.valuePrefix"] = {
          ["class*"] = "styles",
        },
      },
    },
  },
}
